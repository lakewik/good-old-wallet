/**
 * Account Management Utilities
 * Handles multiple accounts derived from a single seed phrase
 */

/**
 * Derive a wallet from seed phrase using BIP44 derivation path
 * Standard Ethereum derivation: m/44'/60'/0'/0/accountIndex
 */
export async function deriveWalletFromPhrase(
  seedPhrase: string,
  accountIndex: number = 0
): Promise<{ address: string; wallet: any }> {
  const { ethers } = await import("ethers");
  
  try {
    // Use HD wallet derivation for all accounts for consistency
    // Standard BIP44 path for Ethereum: m/44'/60'/0'/0/accountIndex
    const mnemonic = ethers.Mnemonic.fromPhrase(seedPhrase);
    const derivationPath = `m/44'/60'/0'/0/${accountIndex}`;
    
    // In ethers v6, we can pass the path directly to fromMnemonic
    // This creates a wallet at the specified derivation path
    const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonic, derivationPath);
    
    return {
      address: wallet.address,
      wallet: wallet,
    };
  } catch (error) {
    console.error(`Error deriving wallet for account ${accountIndex}:`, error);
    // Fallback to simple derivation for account 0
    if (accountIndex === 0) {
      const wallet = ethers.Wallet.fromPhrase(seedPhrase);
      return {
        address: wallet.address,
        wallet: wallet,
      };
    }
    throw error;
  }
}

/**
 * Get account label (default: "Account 1", "Account 2", etc.)
 * Can be overridden with a custom name
 */
export function getAccountLabel(accountIndex: number, customName?: string | null): string {
  if (customName) {
    return customName;
  }
  return `Account ${accountIndex + 1}`;
}

/**
 * Format address for display
 */
export function formatAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}
