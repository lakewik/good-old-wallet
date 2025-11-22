import http from "http";
import { logger } from "../setup/logger.js";
import { getNativeBalance, getErc20Balance } from "../handlers/balances.js";
import { ChainId, CHAINS, type Address } from "../index.js";

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

  for (const chainIdValue of Object.values(ChainId)) {
    // Filter out string keys from numeric enum
    if (typeof chainIdValue !== "number") continue;

    const chainId = chainIdValue as ChainId;
    const chain = CHAINS[chainId];

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

/**
 * GET /assets/:address
 * Returns summarized balances across all chains for a given address
 */
export async function handleAssetsRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  address: string
): Promise<void> {
  if (!isValidAddress(address)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Invalid address format",
        message: "Address must be a valid Ethereum address (0x followed by 40 hex characters)",
      })
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
      })
    );
  }
}

