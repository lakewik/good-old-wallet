import "./setup/config.js"; // Load environment variables
import http from "http";
import url from "url";
import { logger } from "./setup/logger.js";
import { getNativeBalance, getErc20Balance } from "./handlers/balances.js";
import { ChainId, CHAINS, type Address } from "./index.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7000;

interface ChainBalance {
  chainId: number;
  chainName: string;
  native: {
    symbol: string;
    balance: string; // in wei
    balanceFormatted: string; // human readable
  };
  usdc: {
    balance: string; // in smallest unit (6 decimals)
    balanceFormatted: string; // human readable
  };
}

interface SummarizedAmountsResponse {
  address: Address;
  chains: ChainBalance[];
  totals: {
    native: {
      totalWei: string;
      totalFormatted: string;
      symbol: string;
    };
    usdc: {
      totalSmallestUnit: string;
      totalFormatted: string;
    };
  };
}

function formatBalance(balance: bigint, decimals: number): string {
  if (balance === 0n) {
    return "0";
  }

  const divisor = BigInt(10 ** decimals);
  const whole = balance / divisor;
  const remainder = balance % divisor;

  if (remainder === 0n) {
    return whole.toString();
  }

  const remainderStr = remainder.toString().padStart(decimals, "0");
  const trimmed = remainderStr.replace(/0+$/, "");
  return `${whole}.${trimmed}`;
}

async function getSummarizedAmounts(address: Address): Promise<SummarizedAmountsResponse> {
  const chains: ChainBalance[] = [];
  let totalNativeWei = 0n;
  let totalUsdcSmallestUnit = 0n;
  let nativeSymbol = "ETH"; // default

  // Only iterate over chains that are actually configured in CHAINS
  for (const [chainIdStr, chain] of Object.entries(CHAINS)) {
    const chainId = Number(chainIdStr) as ChainId;

    // Get native balance
    const nativeBalance = getNativeBalance(chainId, address);
    const nativeFormatted = formatBalance(nativeBalance, chain.native.decimals);
    totalNativeWei += nativeBalance;
    nativeSymbol = chain.native.symbol;

    // Get USDC balance
    let usdcBalance = 0n;
    let usdcFormatted = "0";
    const usdcToken = chain.commonTokens.USDC;
    if (usdcToken) {
      usdcBalance = getErc20Balance(chainId, usdcToken, address);
      usdcFormatted = formatBalance(usdcBalance, usdcToken.decimals);
      totalUsdcSmallestUnit += usdcBalance;
    }

    chains.push({
      chainId: chainId,
      chainName: chain.name,
      native: {
        symbol: chain.native.symbol,
        balance: nativeBalance.toString(),
        balanceFormatted: nativeFormatted,
      },
      usdc: {
        balance: usdcBalance.toString(),
        balanceFormatted: usdcFormatted,
      },
    });
  }

  return {
    address,
    chains,
    totals: {
      native: {
        totalWei: totalNativeWei.toString(),
        totalFormatted: formatBalance(totalNativeWei, 18), // Assuming all native tokens are 18 decimals
        symbol: nativeSymbol,
      },
      usdc: {
        totalSmallestUnit: totalUsdcSmallestUnit.toString(),
        totalFormatted: formatBalance(totalUsdcSmallestUnit, 6), // USDC has 6 decimals
      },
    },
  };
}

function isValidAddress(address: string): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle OPTIONS request
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url || "", true);
  const pathname = parsedUrl.pathname;

  logger.info("Incoming request", {
    method: req.method,
    pathname,
  });

  // Health check endpoint
  if (pathname === "/health" || pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "abstracted-wallet-api",
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  // Get summarized amounts endpoint
  const summarizedAmountsMatch = pathname?.match(/^\/get-summarized-amounts\/(.+)$/);
  if (summarizedAmountsMatch && req.method === "GET") {
    const address = summarizedAmountsMatch[1] as string;

    if (!isValidAddress(address)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Invalid address format",
          message: "Address must be a valid Ethereum address (0x followed by 40 hex characters)",
        }),
      );
      return;
    }

    try {
      const summarizedAmounts = await getSummarizedAmounts(address as Address);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(summarizedAmounts, null, 2));
    } catch (error) {
      logger.error("Error getting summarized amounts", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return;
  }

  // 404 for all other routes
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Not found",
      message: `Route ${pathname} not found`,
      availableRoutes: [
        "GET /health",
        "GET /get-summarized-amounts/:address",
      ],
    }),
  );
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    logger.error("Port already in use", {
      port: PORT,
      message: `Port ${PORT} is already in use. Please use a different port by setting PORT environment variable.`,
    });
    console.error(`❌ Error: Port ${PORT} is already in use.`);
    console.error(`   Try using a different port: PORT=3001 npm run dev:server`);
    console.error(`   Or kill the process using port ${PORT}: lsof -ti:${PORT} | xargs kill`);
    process.exit(1);
  } else {
    logger.error("Server error", error);
    console.error("❌ Server error:", error.message);
    process.exit(1);
  }
});

server.listen(PORT, "localhost", () => {
  logger.info("Server started", {
    host: "localhost",
    port: PORT,
    endpoints: [
      "GET /health",
      "GET /get-summarized-amounts/:address",
    ],
  });
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`💰 Get summarized amounts: http://localhost:${PORT}/get-summarized-amounts/:address`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});
