/**
 * Storage utility for chrome.storage.local
 * Provides type-safe access to stored wallet data
 */

import type { EncryptedVault } from "./WalletVault";

const STORAGE_KEYS = {
  ENCRYPTED_VAULT: "encrypted_vault",
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
