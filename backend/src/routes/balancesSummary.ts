import http from "http";
import { logger } from "../setup/logger.js";
import { getNativeBalance, getErc20Balance } from "../handlers/balances.js";
import { CHAINS, type Address, ChainId } from "../index.js";

interface BalancesSummaryResponse {
  address: Address;
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
  totalPortfolioValueUSD: string;
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

/**
 * Get ETH price in USD (simplified - in production, use a price API)
 * For now, using a placeholder. In production, fetch from CoinGecko, CoinMarketCap, etc.
 */
async function getEthPriceUSD(): Promise<number> {
  // TODO: Replace with actual price API call
  // Example: const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
  // return response.json().ethereum.usd;
  
  // Placeholder: return a default ETH price
  // In production, cache this value and update periodically
  return 2500; // $2500 per ETH (example)
}

async function getBalancesSummary(address: Address): Promise<BalancesSummaryResponse> {
  let totalNativeWei = 0n;
  let totalUsdcSmallestUnit = 0n;
  let nativeSymbol = "ETH"; // default

  // Only iterate over chains that are actually configured in CHAINS
  for (const [chainIdStr, chain] of Object.entries(CHAINS)) {
    const chainId = Number(chainIdStr) as ChainId;

    // Get native balance
    const nativeBalance = getNativeBalance(chainId, address);
    totalNativeWei += nativeBalance;
    nativeSymbol = chain.native.symbol;

    // Get USDC balance
    const usdcToken = chain.commonTokens.USDC;
    if (usdcToken) {
      const usdcBalance = getErc20Balance(chainId, usdcToken, address);
      totalUsdcSmallestUnit += usdcBalance;
    }
  }

  // Calculate total portfolio value in USD
  const ethPriceUSD = await getEthPriceUSD();
  const totalEth = Number(totalNativeWei) / Math.pow(10, 18);
  const totalUsdc = Number(totalUsdcSmallestUnit) / Math.pow(10, 6);
  
  // Total value = (ETH amount * ETH price) + USDC amount
  const totalPortfolioValueUSD = (totalEth * ethPriceUSD) + totalUsdc;

  return {
    address,
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
    totalPortfolioValueUSD: totalPortfolioValueUSD.toFixed(2),
  };
}

function isValidAddress(address: string): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * @swagger
 * /balancesSummary/{address}:
 *   get:
 *     summary: Get balances summary
 *     description: Returns aggregated balances totals across all chains and total portfolio value in USD
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
 *         description: Successfully retrieved balances summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                   example: "0x13190e7028c5e7e70f87efe08a973c330b09f458"
 *                 totals:
 *                   type: object
 *                   properties:
 *                     native:
 *                       type: object
 *                       properties:
 *                         totalWei:
 *                           type: string
 *                           example: "5300000000000000000"
 *                         totalFormatted:
 *                           type: string
 *                           example: "5.3"
 *                         symbol:
 *                           type: string
 *                           example: "ETH"
 *                     usdc:
 *                       type: object
 *                       properties:
 *                         totalSmallestUnit:
 *                           type: string
 *                           example: "400000000"
 *                         totalFormatted:
 *                           type: string
 *                           example: "400"
 *                 totalPortfolioValueUSD:
 *                   type: string
 *                   description: Total portfolio value in USD (ETH value + USDC value)
 *                   example: "13650.00"
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
export async function handleBalancesSummaryRequest(
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
    const summary = await getBalancesSummary(address as Address);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(summary, null, 2));
  } catch (error) {
    logger.error("Error getting balances summary", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
