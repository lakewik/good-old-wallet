/**
 * Storage utility for chrome.storage.local
 * Provides type-safe access to stored wallet data
 */

import type { EncryptedVault } from "./WalletVault";

const STORAGE_KEYS = {
  ENCRYPTED_VAULT: "encrypted_vault",
  PENDING_TRANSACTIONS: "pending_transactions",
} as const;

export interface StoredWalletData {
  vault: EncryptedVault;
  createdAt: number;
}

/**
 * Save encrypted vault to chrome.storage.local
 */
export async function saveEncryptedVault(vault: EncryptedVault): Promise<void> {
  const walletData: StoredWalletData = {
    vault,
    createdAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    chrome.storage.local.set(
      { [STORAGE_KEYS.ENCRYPTED_VAULT]: walletData },
      () => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(
              `Failed to save vault: ${chrome.runtime.lastError.message}`,
            ),
          );
        } else {
          resolve();
        }
      },
    );
  });
}

/**
 * Retrieve encrypted vault from chrome.storage.local
 */
export async function getEncryptedVault(): Promise<StoredWalletData | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEYS.ENCRYPTED_VAULT], (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Failed to retrieve vault: ${chrome.runtime.lastError.message}`,
          ),
        );
      } else {
        const data = result[STORAGE_KEYS.ENCRYPTED_VAULT] as
          | StoredWalletData
          | undefined;
        resolve(data || null);
      }
    });
  });
}

/**
 * Check if a wallet exists in storage
 */
export async function hasWallet(): Promise<boolean> {
  const vault = await getEncryptedVault();
  return vault !== null;
}

/**
 * Clear the stored wallet (for logout/reset)
 */
export async function clearWallet(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove([STORAGE_KEYS.ENCRYPTED_VAULT], () => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Failed to clear wallet: ${chrome.runtime.lastError.message}`,
          ),
        );
      } else {
        resolve();
      }
    });
  });
}

export type TransactionStatus = "pending" | "success" | "failed";

export interface SubTransaction {
  chainId: number;
  chainName: string;
  amountUsdc: string;
  gasCostUsdc: string;
  status: TransactionStatus;
  txHash?: string;
  blockExplorerUrl?: string;
}

export interface PendingTransaction {
  id: string;
  recipientAddress: string;
  tokenSymbol: string;
  totalAmount: string;
  totalGasCostUsdc: string;
  type: "multi" | "single";
  subTransactions: SubTransaction[];
  status: TransactionStatus;
  createdAt: number;
}

/**
 * Save pending transactions to chrome.storage.local
 */
export async function savePendingTransactions(
  transactions: PendingTransaction[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(
      { [STORAGE_KEYS.PENDING_TRANSACTIONS]: transactions },
      () => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(
              `Failed to save pending transactions: ${chrome.runtime.lastError.message}`,
            ),
          );
        } else {
          resolve();
        }
      },
    );
  });
}

/**
 * Get pending transactions from chrome.storage.local
 */
export async function getPendingTransactions(): Promise<PendingTransaction[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEYS.PENDING_TRANSACTIONS], (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Failed to retrieve pending transactions: ${chrome.runtime.lastError.message}`,
          ),
        );
      } else {
        const transactions = result[STORAGE_KEYS.PENDING_TRANSACTIONS] as
          | PendingTransaction[]
          | undefined;
        resolve(transactions || []);
      }
    });
  });
}
