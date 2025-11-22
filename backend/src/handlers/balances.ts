import { ethers } from "ethers";
import { ChainId, Address, TokenConfig, NATIVE_TOKEN_ADDRESS } from "../setup/types.js";
import { providers } from "../setup/providers.js";
import { CHAINS } from "../setup/chains.js";
import { logger } from "../setup/logger.js";

/**
 * Format a BigInt amount to human-readable format with specified decimals
 * @param amount - Amount in smallest unit (e.g., wei for ETH, smallest unit for USDC)
 * @param decimals - Number of decimals (e.g., 18 for ETH, 6 for USDC)
 * @returns Formatted string with proper decimal places
 */
function formatAmount(amount: bigint, decimals: number): string {
  if (amount === 0n) {
    return "0";
  }
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  
  if (remainder === 0n) {
    return whole.toString();
  }
  
  const remainderStr = remainder.toString().padStart(decimals, "0");
  const trimmed = remainderStr.replace(/0+$/, "");
  return `${whole}.${trimmed}`;
}

// Balance storage structure: chainId -> wallet -> tokenAddress -> balance (as string for JSON compatibility)
type BalanceStorage = Record<
  number,
  Record<Address, Record<Address, string>>
>;

// In-memory balance storage (will be populated from external API)
let balanceStorage: BalanceStorage = {
  // Ethereum (ChainId 1)
  [ChainId.ETHEREUM]: {
    "0x13190e7028c5e7e70f87efe08a973c330b09f458": {
      [NATIVE_TOKEN_ADDRESS]: "3500000000000000000", // 3.5 ETH
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": "250000000", // 250 USDC
    },
  },
  // Base (ChainId 8453)
  [ChainId.BASE]: {
    "0x13190e7028c5e7e70f87efe08a973c330b09f458": {
      [NATIVE_TOKEN_ADDRESS]: "1800000000000000000", // 1.8 ETH
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": "150000000", // 150 USDC
    },
  },
};

/**
 * Update balances from a JSON object
 * Expected format: { [chainId]: { [wallet]: { [tokenAddress]: "balance" } } }
 * @param balances - JSON object containing balances
 */
export function updateBalancesFromJson(balances: BalanceStorage): void {
  balanceStorage = balances;
  
  // Calculate total balances across all chains for each token
  let totalNativeWei = 0n;
  let totalUsdcSmallestUnit = 0n;
  let nativeSymbol = "ETH"; // default
  const chainSummaries: Array<{
    chainId: number;
    chainName: string;
    nativeBalance: string;
    nativeBalanceFormatted: string;
    usdcBalance: string;
    usdcBalanceFormatted: string;
  }> = [];

  // Iterate through all chains in the balances
  for (const [chainIdStr, chainBalances] of Object.entries(balances)) {
    const chainId = Number(chainIdStr) as ChainId;
    const chainConfig = CHAINS[chainId];
    
    if (!chainConfig) {
      // Skip chains that aren't configured
      continue;
    }

    let chainNativeTotal = 0n;
    let chainUsdcTotal = 0n;

    // Iterate through all wallets on this chain
    for (const [wallet, walletBalances] of Object.entries(chainBalances)) {
      // Sum native token balance
      const nativeBalanceStr = walletBalances[NATIVE_TOKEN_ADDRESS];
      if (nativeBalanceStr) {
        chainNativeTotal += BigInt(nativeBalanceStr);
      }

      // Sum USDC balance
      const usdcToken = chainConfig.commonTokens.USDC;
      if (usdcToken) {
        const usdcBalanceStr = walletBalances[usdcToken.address];
        if (usdcBalanceStr) {
          chainUsdcTotal += BigInt(usdcBalanceStr);
        }
      }
    }

    // Add to totals
    totalNativeWei += chainNativeTotal;
    totalUsdcSmallestUnit += chainUsdcTotal;
    nativeSymbol = chainConfig.native.symbol;

    // Store chain summary
    const chainNativeFormatted = formatAmount(chainNativeTotal, chainConfig.native.decimals);
    const chainUsdcFormatted = formatAmount(chainUsdcTotal, 6); // USDC has 6 decimals
    chainSummaries.push({
      chainId,
      chainName: chainConfig.name,
      nativeBalance: chainNativeTotal.toString(),
      nativeBalanceFormatted: chainNativeFormatted,
      usdcBalance: chainUsdcTotal.toString(),
      usdcBalanceFormatted: chainUsdcFormatted,
    });
  }

  // Format totals
  const totalNativeFormatted = formatAmount(totalNativeWei, 18); // Assuming all native tokens are 18 decimals
  const totalUsdcFormatted = formatAmount(totalUsdcSmallestUnit, 6); // USDC has 6 decimals

  logger.info("Balances updated from JSON", {
    chainCount: Object.keys(balances).length,
  });

  logger.success("Total balances summary across all chains", {
    native: {
      symbol: nativeSymbol,
      totalWei: totalNativeWei.toString(),
      totalFormatted: totalNativeFormatted,
    },
    usdc: {
      totalSmallestUnit: totalUsdcSmallestUnit.toString(),
      totalFormatted: totalUsdcFormatted,
    },
    perChain: chainSummaries,
  });
}

/**
 * Get all stored balances as JSON object
 * @returns Current balance storage
 */
export function getBalancesAsJson(): BalanceStorage {
  return balanceStorage;
}

/**
 * Get native balance from JSON storage
 * @param chainId - The chain ID
 * @param wallet - The wallet address
 * @returns The balance in wei, or 0n if not found
 */
export function getNativeBalance(
  chainId: ChainId,
  wallet: Address,
): bigint {
  logger.debug("Fetching native balance from JSON storage", { chainId, wallet });

  const chainBalances = balanceStorage[chainId];
  if (!chainBalances) {
    logger.debug("No balances found for chain", { chainId });
    return 0n;
  }

  const walletBalances = chainBalances[wallet];
  if (!walletBalances) {
    logger.debug("No balances found for wallet on chain", { chainId, wallet });
    return 0n;
  }

  const balanceStr = walletBalances[NATIVE_TOKEN_ADDRESS];
  if (!balanceStr) {
    logger.debug("No native balance found", { chainId, wallet });
    return 0n;
  }

  const balance = BigInt(balanceStr);
  const chainConfig = CHAINS[chainId];
  const balanceFormatted = chainConfig ? formatAmount(balance, chainConfig.native.decimals) : balance.toString();
  logger.info("Native balance fetched from JSON storage", {
    chainId,
    wallet,
    balance: balance.toString(),
    balanceFormatted,
  });
  return balance;
}

/**
 * Get ERC-20 balance from JSON storage
 * @param chainId - The chain ID
 * @param token - The token configuration
 * @param wallet - The wallet address
 * @returns The balance in token's smallest unit, or 0n if not found
 */
export function getErc20Balance(
  chainId: ChainId,
  token: TokenConfig,
  wallet: Address,
): bigint {
  logger.debug("Fetching ERC-20 balance from JSON storage", {
    chainId,
    token: token.symbol,
    tokenAddress: token.address,
    wallet,
  });

  const chainBalances = balanceStorage[chainId];
  if (!chainBalances) {
    logger.debug("No balances found for chain", { chainId });
    return 0n;
  }

  const walletBalances = chainBalances[wallet];
  if (!walletBalances) {
    logger.debug("No balances found for wallet on chain", { chainId, wallet });
    return 0n;
  }

  const balanceStr = walletBalances[token.address];
  if (!balanceStr) {
    logger.debug("No token balance found", {
      chainId,
      wallet,
      tokenAddress: token.address,
    });
    return 0n;
  }

  const balance = BigInt(balanceStr);
  const balanceFormatted = formatAmount(balance, token.decimals);
  logger.info("ERC-20 balance fetched from JSON storage", {
    chainId,
    token: token.symbol,
    wallet,
    balance: balance.toString(),
    balanceFormatted,
  });
  return balance;
}

/**
 * Get native balance directly from RPC provider
 * @param chainId - The chain ID
 * @param wallet - The wallet address
 * @returns The balance in wei
 */
export async function getNativeBalanceFromProvider(
  chainId: ChainId,
  wallet: Address,
): Promise<bigint> {
  logger.debug("Fetching native balance from provider", { chainId, wallet });

  try {
    const provider = providers[chainId];
    if (!provider) {
      throw new Error(`Provider not configured for chain ${chainId}. Chain may be commented out in chains.ts`);
    }
    const balance = await provider.getBalance(wallet);
    const chainConfig = CHAINS[chainId];
    const balanceFormatted = chainConfig ? formatAmount(balance, chainConfig.native.decimals) : balance.toString();
    logger.info("Native balance fetched from RPC", {
      chainId,
      wallet,
      balance: balance.toString(),
      balanceFormatted,
    });
    return balance;
  } catch (error) {
    logger.error("Failed to fetch native balance from provider", error);
    throw error;
  }
}

/**
 * Get ERC-20 balance directly from RPC provider
 * @param chainId - The chain ID
 * @param token - The token configuration
 * @param wallet - The wallet address
 * @returns The balance in token's smallest unit
 */
export async function getErc20BalanceFromProvider(
  chainId: ChainId,
  token: TokenConfig,
  wallet: Address,
): Promise<bigint> {
  logger.debug("Fetching ERC-20 balance from provider", {
    chainId,
    token: token.symbol,
    tokenAddress: token.address,
    wallet,
  });

  try {
    const provider = providers[chainId];
    if (!provider) {
      throw new Error(`Provider not configured for chain ${chainId}. Chain may be commented out in chains.ts`);
    }
    const erc20 = new ethers.Contract(
      token.address,
      ["function balanceOf(address) view returns (uint256)"],
      provider,
    );
    const balance = await erc20.balanceOf(wallet) as bigint;
    const balanceFormatted = formatAmount(balance, token.decimals);
    logger.info("ERC-20 balance fetched from RPC", {
      chainId,
      token: token.symbol,
      wallet,
      balance: balance.toString(),
      balanceFormatted,
    });
    return balance;
  } catch (error) {
    logger.error("Failed to fetch ERC-20 balance from provider", error);
    throw error;
  }
}
