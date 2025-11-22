/**
 * REFERENCE: Test signing code
 *
 * This code was used to test transaction signing functionality.
 * Kept for reference purposes.
 */

import { WalletVault } from "./WalletVault";
import type { EncryptedVault } from "./WalletVault";

export async function testSigningReference(
  password: string,
  encryptedVault: EncryptedVault
): Promise<{
  address: string;
  signature: string;
  message: string;
  verified: boolean;
} | null> {
  try {
    const vault = new WalletVault();
    const testMessage = "Hello, Ethereum! Test message from wallet.";

    let result: {
      address: string;
      signature: string;
      message: string;
      verified: boolean;
    } | null = null;

    await vault.unlockAndExecute(
      password,
      encryptedVault,
      async (seedPhraseBytes) => {
        const decoder = new TextDecoder();
        const seedPhrase = decoder.decode(seedPhraseBytes);

        // Dynamically import ethers (only in browser)
        const { ethers } = await import("ethers");
        const wallet = ethers.Wallet.fromPhrase(seedPhrase);
        const signature = await wallet.signMessage(testMessage);
        const recoveredAddress = ethers.verifyMessage(testMessage, signature);
        const verified =
          recoveredAddress.toLowerCase() === wallet.address.toLowerCase();

        result = {
          address: wallet.address,
          signature,
          message: testMessage,
          verified,
        };
      }
    );

    return result;
  } catch (error) {
    console.error("Signing error:", error);
    return null;
  }
}
