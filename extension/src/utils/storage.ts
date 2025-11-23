/**
 * Storage utility for chrome.storage.local
 * Provides type-safe access to stored wallet data
 */

import type { EncryptedVault } from "./WalletVault";

const STORAGE_KEYS = {
  ENCRYPTED_VAULT: "encrypted_vault",
  PENDING_TRANSACTIONS: "pending_transactions",
  SELECTED_ACCOUNT_INDEX: "selected_account_index",
  ACCOUNT_COUNT: "account_count",
  ACCOUNT_INDICES: "account_indices", // List of active account indices
  ACCOUNT_COLORS: "account_colors", // Mapping of accountIndex -> color
  ACCOUNT_NAMES: "account_names", // Mapping of accountIndex -> name
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

/**
 * Remove a pending transaction by ID from chrome.storage.local
 */
export async function removePendingTransaction(
  transactionId: string,
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const transactions = await getPendingTransactions();
      const filtered = transactions.filter((tx) => tx.id !== transactionId);
      await savePendingTransactions(filtered);
      resolve();
    } catch (error) {
      reject(
        new Error(
          `Failed to remove transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
    }
  });
}

/**
 * Get the selected account index
 */
export async function getSelectedAccountIndex(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEYS.SELECTED_ACCOUNT_INDEX], (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Failed to retrieve selected account: ${chrome.runtime.lastError.message}`,
          ),
        );
      } else {
        const index = result[STORAGE_KEYS.SELECTED_ACCOUNT_INDEX] as number | undefined;
        resolve(index ?? 0); // Default to account 0
      }
    });
  });
}

/**
 * Set the selected account index
 */
export async function setSelectedAccountIndex(index: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(
      { [STORAGE_KEYS.SELECTED_ACCOUNT_INDEX]: index },
      () => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(
              `Failed to save selected account: ${chrome.runtime.lastError.message}`,
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
 * Get the list of active account indices
 */
export async function getAccountIndices(): Promise<number[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEYS.ACCOUNT_INDICES], (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Failed to retrieve account indices: ${chrome.runtime.lastError.message}`,
          ),
        );
      } else {
        const indices = result[STORAGE_KEYS.ACCOUNT_INDICES] as number[] | undefined;
        // If no indices stored, default to [0] for backward compatibility
        if (!indices || indices.length === 0) {
          resolve([0]);
        } else {
          resolve(indices.sort((a, b) => a - b)); // Return sorted
        }
      }
    });
  });
}

/**
 * Set the list of active account indices
 */
export async function setAccountIndices(indices: number[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(
      { [STORAGE_KEYS.ACCOUNT_INDICES]: indices },
      () => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(
              `Failed to save account indices: ${chrome.runtime.lastError.message}`,
            ),
          );
        } else {
          // Also update count for backward compatibility
          setAccountCount(indices.length).then(() => resolve()).catch(reject);
        }
      },
    );
  });
}

/**
 * Get the total number of accounts
 */
export async function getAccountCount(): Promise<number> {
  const indices = await getAccountIndices();
  return indices.length;
}

/**
 * Set the total number of accounts
 */
export async function setAccountCount(count: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(
      { [STORAGE_KEYS.ACCOUNT_COUNT]: count },
      () => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(
              `Failed to save account count: ${chrome.runtime.lastError.message}`,
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
 * Add a new account (finds the next available index)
 */
export async function addAccount(): Promise<number> {
  const indices = await getAccountIndices();
  
  // Find the next available index
  let newIndex = 0;
  while (indices.includes(newIndex)) {
    newIndex++;
  }
  
  // Add the new index to the list
  const updatedIndices = [...indices, newIndex].sort((a, b) => a - b);
  await setAccountIndices(updatedIndices);
  
  return newIndex;
}

/**
 * Delete an account (removes the specific index from the list)
 * @param accountIndex The index of the account to delete
 * @returns The new list of account indices
 */
export async function deleteAccount(accountIndex: number): Promise<number[]> {
  const indices = await getAccountIndices();
  
  // Prevent deleting if only one account remains
  if (indices.length <= 1) {
    throw new Error("Cannot delete the last account");
  }
  
  // Check if the account index exists
  if (!indices.includes(accountIndex)) {
    throw new Error(`Account ${accountIndex} does not exist`);
  }
  
  // Remove the account index from the list
  const updatedIndices = indices.filter(idx => idx !== accountIndex);
  await setAccountIndices(updatedIndices);
  
  // Check if the deleted account was the selected one
  const selectedIndex = await getSelectedAccountIndex();
  if (selectedIndex === accountIndex) {
    // Switch to the first available account
    const newSelectedIndex = updatedIndices[0];
    await setSelectedAccountIndex(newSelectedIndex);
  }
  
  return updatedIndices;
}

/**
 * Get the color for a specific account
 */
export async function getAccountColor(accountIndex: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEYS.ACCOUNT_COLORS], (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Failed to retrieve account color: ${chrome.runtime.lastError.message}`,
          ),
        );
      } else {
        const colors = result[STORAGE_KEYS.ACCOUNT_COLORS] as Record<number, string> | undefined;
        resolve(colors?.[accountIndex] || null);
      }
    });
  });
}

/**
 * Get all account colors
 */
export async function getAllAccountColors(): Promise<Record<number, string>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEYS.ACCOUNT_COLORS], (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Failed to retrieve account colors: ${chrome.runtime.lastError.message}`,
          ),
        );
      } else {
        const colors = result[STORAGE_KEYS.ACCOUNT_COLORS] as Record<number, string> | undefined;
        resolve(colors || {});
      }
    });
  });
}

/**
 * Set the color for a specific account
 */
export async function setAccountColor(accountIndex: number, color: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEYS.ACCOUNT_COLORS], (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Failed to retrieve account colors: ${chrome.runtime.lastError.message}`,
          ),
        );
        return;
      }
      
      const colors = (result[STORAGE_KEYS.ACCOUNT_COLORS] as Record<number, string> | undefined) || {};
      const updatedColors = { ...colors, [accountIndex]: color };
      
      chrome.storage.local.set(
        { [STORAGE_KEYS.ACCOUNT_COLORS]: updatedColors },
        () => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                `Failed to save account color: ${chrome.runtime.lastError.message}`,
              ),
            );
          } else {
            resolve();
          }
        },
      );
    });
  });
}

/**
 * Get the name for a specific account
 */
export async function getAccountName(accountIndex: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEYS.ACCOUNT_NAMES], (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Failed to retrieve account name: ${chrome.runtime.lastError.message}`,
          ),
        );
      } else {
        const names = result[STORAGE_KEYS.ACCOUNT_NAMES] as Record<number, string> | undefined;
        resolve(names?.[accountIndex] || null);
      }
    });
  });
}

/**
 * Get all account names
 */
export async function getAllAccountNames(): Promise<Record<number, string>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEYS.ACCOUNT_NAMES], (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Failed to retrieve account names: ${chrome.runtime.lastError.message}`,
          ),
        );
      } else {
        const names = result[STORAGE_KEYS.ACCOUNT_NAMES] as Record<number, string> | undefined;
        resolve(names || {});
      }
    });
  });
}

/**
 * Set the name for a specific account
 */
export async function setAccountName(accountIndex: number, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEYS.ACCOUNT_NAMES], (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new Error(
            `Failed to retrieve account names: ${chrome.runtime.lastError.message}`,
          ),
        );
        return;
      }
      
      const names = (result[STORAGE_KEYS.ACCOUNT_NAMES] as Record<number, string> | undefined) || {};
      const updatedNames = { ...names, [accountIndex]: name };
      
      chrome.storage.local.set(
        { [STORAGE_KEYS.ACCOUNT_NAMES]: updatedNames },
        () => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                `Failed to save account name: ${chrome.runtime.lastError.message}`,
              ),
            );
          } else {
            resolve();
          }
        },
      );
    });
  });
}
