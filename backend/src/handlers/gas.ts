import { ethers } from "ethers";
import { ChainId, Address } from "../setup/types.js";
import { providers } from "../setup/providers.js";
import { CHAINS } from "../setup/chains.js";
import { logger } from "../setup/logger.js";

export async function estimateUsdcTransferGas(
  chainId: ChainId,
  from: Address,
  to: Address,
  amount: bigint,
): Promise<{ gas: bigint; gasPrice: bigint }> {
  logger.debug("Estimating USDC transfer gas", {
    chainId,
    from,
    to,
    amount: amount.toString(),
  });
  
  // Validate addresses before proceeding
  if (!ethers.isAddress(from)) {
    throw new Error(`Invalid 'from' address: ${from}`);
  }
  if (!ethers.isAddress(to)) {
    throw new Error(`Invalid 'to' address: ${to}`);
  }
  
  // Validate configuration first (these are unexpected errors that should be logged)
  const provider = providers[chainId];
  if (!provider) {
    const error = new Error(`Provider not configured for chain ${chainId}. Chain may be commented out in chains.ts`);
    logger.error("Failed to estimate USDC transfer gas - missing provider", {
      chainId,
      error: error.message,
    });
    throw error;
  }
  
  const chainConfig = CHAINS[chainId];
  if (!chainConfig) {
    const error = new Error(`Chain ${chainId} not configured`);
    logger.error("Failed to estimate USDC transfer gas - missing chain config", {
      chainId,
      error: error.message,
    });
    throw error;
  }
  
  const usdc = chainConfig.commonTokens.USDC;
  if (!usdc) {
    const error = new Error(`USDC token not configured for chain ${chainId}`);
    logger.error("Failed to estimate USDC transfer gas - missing USDC token", {
      chainId,
      error: error.message,
    });
    throw error;
  }

  // For gas estimation, we use the provider directly (no signer needed)
  const contract = new ethers.Contract(
    usdc.address,
    ["function transfer(address to, uint256 value) returns (bool)"],
    provider,
  );

  try {
    // Estimate gas for the transfer with the 'from' address specified
    // In ethers v6, we need to use populateTransaction and then estimateGas
    const populatedTx = await contract.transfer.populateTransaction(to, amount);
    const gas = await provider.estimateGas({
      ...populatedTx,
      from: from,
    });
    
    // Get fee data (gas price or max fee per gas for EIP-1559)
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? (feeData.maxFeePerGas ? feeData.maxFeePerGas : 0n);
    const totalCost = gas * gasPrice;
    
    // Format send amount for display (USDC has 6 decimals)
    const sendAmountUsdc = Number(amount) / 1e6;
    
    logger.success("Gas estimation successful", {
      chainId,
      chainName: chainConfig.name,
      sendAmount: amount.toString(),
      sendAmountUsdc: sendAmountUsdc.toFixed(6),
      gas: gas.toString(),
      gasPrice: gasPrice.toString(),
      totalCostNative: totalCost.toString(),
      gasPriceGwei: gasPrice > 0n ? (gasPrice / BigInt(1e9)).toString() : "0",
    });
    
    return { gas, gasPrice };
  } catch (error) {
    // Gas estimation failures are expected in some scenarios (e.g., insufficient balance, RPC issues)
    // Log at info level so it's visible, but don't duplicate in orchestrator
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.info("Gas estimation failed", {
      chainId,
      chainName: chainConfig.name,
      reason: errorMessage,
    });
    // Re-throw with context for the caller
    throw new Error(`Gas estimation failed for chain ${chainId}: ${errorMessage}`);
  }
}

// Price cache to avoid too many API calls
// Cache expires after 5 minutes
interface PriceCache {
  price: number;
  timestamp: number;
}

const PRICE_CACHE: Map<string, PriceCache> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchEthPriceFromCoinGecko(): Promise<number> {
  const cacheKey = "ethereum";
  const cached = PRICE_CACHE.get(cacheKey);
  
  // Return cached price if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug("Using cached ETH price", {
      price: cached.price,
      age: Date.now() - cached.timestamp,
    });
    return cached.price;
  }

  try {
    logger.debug("Fetching ETH price from CoinGecko");
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      {
        headers: {
          "Accept": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { ethereum?: { usd?: number } };
    
    if (!data.ethereum?.usd) {
      throw new Error("Invalid response from CoinGecko: missing price data");
    }

    const price = data.ethereum.usd;
    
    // Update cache
    PRICE_CACHE.set(cacheKey, {
      price,
      timestamp: Date.now(),
    });

    logger.debug("ETH price fetched from CoinGecko", {
      price,
    });

    return price;
  } catch (error) {
    // If we have a cached price, use it even if expired
    if (cached) {
      logger.warn("Failed to fetch ETH price, using expired cache", {
        error: error instanceof Error ? error.message : String(error),
        cachedPrice: cached.price,
      });
      return cached.price;
    }

    logger.error("Failed to fetch ETH price from CoinGecko", error);
    throw new Error(
      `Failed to fetch ETH price: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function gasCostInUsdc(
  chainId: ChainId,
  nativeAmountWei: bigint,
): Promise<bigint> {
  logger.debug("Converting native token amount to USDC", {
    chainId,
    nativeAmountWei: nativeAmountWei.toString(),
  });

  const chainConfig = CHAINS[chainId];
  if (!chainConfig) {
    throw new Error(`Chain ${chainId} not configured`);
  }

  // Get ETH price in USD
  const ethPriceUsd = await fetchEthPriceFromCoinGecko();

  // Convert native amount (wei) to USDC
  // Formula: (nativeAmountWei / 10^18) * ethPriceUsd * 10^6
  // Using BigInt for precision: (nativeAmountWei * priceScaled * 10^6) / (10^18 * priceScaleFactor)
  
  // Scale price to 8 decimal places for precision (e.g., 2500.50 -> 250050000000)
  const PRICE_SCALE_FACTOR = 1e8;
  const priceScaled = BigInt(Math.round(ethPriceUsd * PRICE_SCALE_FACTOR));
  const usdcDecimals = BigInt(10 ** 6);
  const nativeDecimals = BigInt(10 ** chainConfig.native.decimals);

  // Calculate: (nativeAmountWei * priceScaled * usdcDecimals) / (nativeDecimals * priceScaleFactor)
  const numerator = nativeAmountWei * priceScaled * usdcDecimals;
  const denominator = nativeDecimals * BigInt(PRICE_SCALE_FACTOR);
  const usdcAmount = numerator / denominator;

  logger.success("Converted native token to USDC", {
    chainId,
    chainName: chainConfig.name,
    nativeAmountWei: nativeAmountWei.toString(),
    ethPriceUsd: ethPriceUsd.toFixed(2),
    usdcAmount: usdcAmount.toString(),
  });

  return usdcAmount;
}
