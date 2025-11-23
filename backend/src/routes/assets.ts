import { logger } from "../setup/logger.js";
import { getNativeBalance, getErc20Balance } from "../handlers/get-balances.js";
import { ChainId, CHAINS, type Address } from "../index.js";
import http from "http";

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
    const nativeBalance = await getNativeBalance(chainId, address);
    const nativeFormatted = formatBalance(nativeBalance, chain.native.decimals);
    totalNativeWei += nativeBalance;
    nativeSymbol = chain.native.symbol;

    // Get USDC balance
    let usdcBalance = 0n;
    let usdcFormatted = "0";
    const usdcToken = chain.commonTokens.USDC;
    if (usdcToken) {
      usdcBalance = await getErc20Balance(chainId, usdcToken, address);
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
 * @swagger
 * /assets/{address}:
 *   get:
 *     summary: Get summarized balances across all chains
 *     description: Returns native token and USDC balances for a given address across all supported chains
 *     tags: [Assets]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Ethereum wallet address
 *         example: "0x13190e7028c5e7e70f87efe08a973c330b09f458"
 *     responses:
 *       200:
 *         description: Successfully retrieved balances
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SummarizedAmountsResponse'
 *       400:
 *         description: Invalid address format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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

