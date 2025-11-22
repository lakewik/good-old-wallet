import { ethers } from "ethers";
import { ChainId, Address, TokenConfig, NATIVE_TOKEN_ADDRESS } from "../setup/types.js";
import { providers } from "../setup/providers.js";
import { logger } from "../setup/logger.js";

// Balance storage structure: chainId -> wallet -> tokenAddress -> balance (as string for JSON compatibility)
type BalanceStorage = Record<
  number,
  Record<Address, Record<Address, string>>
>;

// In-memory balance storage (will be populated from external API)
let balanceStorage: BalanceStorage = {};

/**
 * Update balances from a JSON object
 * Expected format: { [chainId]: { [wallet]: { [tokenAddress]: "balance" } } }
 * @param balances - JSON object containing balances
 */
export function updateBalancesFromJson(balances: BalanceStorage): void {
  balanceStorage = balances;
  logger.info("Balances updated from JSON", {
    chainCount: Object.keys(balances).length,
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
  logger.info("Native balance fetched from JSON storage", {
    chainId,
    wallet,
    balance: balance.toString(),
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
  logger.info("ERC-20 balance fetched from JSON storage", {
    chainId,
    token: token.symbol,
    wallet,
    balance: balance.toString(),
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
    logger.info("Native balance fetched from RPC", {
      chainId,
      wallet,
      balance: balance.toString(),
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
    logger.info("ERC-20 balance fetched from RPC", {
      chainId,
      token: token.symbol,
      wallet,
      balance: balance.toString(),
    });
    return balance;
  } catch (error) {
    logger.error("Failed to fetch ERC-20 balance from provider", error);
    throw error;
  }
}
