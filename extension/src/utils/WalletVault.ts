/**
 * WalletVault - Secure wallet encryption/decryption using Web Crypto API
 *
 * This class provides secure storage of seed phrases and private keys using:
 * - PBKDF2 for key derivation (100,000 iterations)
 * - AES-GCM for encryption (provides both encryption and integrity)
 * - Memory wiping with Uint8Array.fill(0) to prevent key leaks
 */

export interface EncryptedVault {
  cipherText: number[]; // The encrypted seed phrase/private key
  iv: number[]; // Initialization Vector
  salt: number[]; // Salt used for key derivation
}

export class WalletVault {
  private readonly PBKDF2_ITERATIONS = 100000;
  private readonly SALT_LENGTH = 16;
  private readonly IV_LENGTH = 12; // Standard for AES-GCM

  /**
   * UTILITY: Convert String password to Key Material
   */
  private async getPasswordKey(password: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    return window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
  }

  /**
   * KEY DERIVATION: Turn password + salt into an AES Key
   */
  private async deriveKey(
    passwordKey: CryptoKey,
    salt: Uint8Array,
  ): Promise<CryptoKey> {
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: this.PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      false, // non-extractable: the key cannot be exported to JS context easily
      ["encrypt", "decrypt"],
    );
  }

  /**
   * ENCRYPTION FLOW
   * Takes a seed phrase (or private key) and a password.
   * Returns the object to store in chrome.storage.local
   */
  async encryptWallet(
    password: string,
    seedPhrase: string,
  ): Promise<EncryptedVault> {
    if (!password || password.length === 0) {
      throw new Error("Password cannot be empty");
    }

    if (!seedPhrase || seedPhrase.trim().length === 0) {
      throw new Error("Seed phrase cannot be empty");
    }

    const salt = window.crypto.getRandomValues(
      new Uint8Array(this.SALT_LENGTH),
    );
    const iv = window.crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

    const passwordKey = await this.getPasswordKey(password);
    const aesKey = await this.deriveKey(passwordKey, salt);

    const enc = new TextEncoder();
    const seedPhraseBuffer = enc.encode(seedPhrase.trim());

    try {
      const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        aesKey,
        seedPhraseBuffer,
      );

      // Zero out the raw seed phrase buffer immediately
      seedPhraseBuffer.fill(0);

      return {
        cipherText: Array.from(new Uint8Array(encryptedBuffer)),
        iv: Array.from(iv),
        salt: Array.from(salt),
      };
    } catch (error) {
      // Ensure cleanup even on error
      seedPhraseBuffer.fill(0);
      throw new Error(
        `Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * DECRYPTION FLOW (The Sensitive Part)
   * Decrypts, executes a callback with the decrypted seed phrase, and WIPES memory immediately.
   */
  async unlockAndExecute(
    password: string,
    vault: EncryptedVault,
    action: (decryptedSeedPhrase: Uint8Array) => Promise<void>,
  ): Promise<void> {
    if (!password || password.length === 0) {
      throw new Error("Password cannot be empty");
    }

    const salt = new Uint8Array(vault.salt);
    const iv = new Uint8Array(vault.iv);
    const data = new Uint8Array(vault.cipherText);

    try {
      const passwordKey = await this.getPasswordKey(password);
      const aesKey = await this.deriveKey(passwordKey, salt);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        aesKey,
        data,
      );

      const sensitiveSeedPhraseArray = new Uint8Array(decryptedBuffer);

      // EXECUTE THE ACTION (e.g., use seed phrase for signing)
      await action(sensitiveSeedPhraseArray);

      // CLEANUP: Explicitly wipe the memory
      sensitiveSeedPhraseArray.fill(0);
    } catch (error) {
      if (error instanceof Error && error.message.includes("decryption")) {
        throw new Error("Incorrect password or corrupted vault");
      }
      throw error;
    }
  }

  /**
   * Helper method to decrypt and get the seed phrase as a string
   * WARNING: This creates a string in memory which cannot be wiped.
   * Use unlockAndExecute when possible instead.
   */
  async decryptWallet(
    password: string,
    vault: EncryptedVault,
  ): Promise<string> {
    let decryptedString = "";

    await this.unlockAndExecute(password, vault, async (decryptedBytes) => {
      const decoder = new TextDecoder();
      decryptedString = decoder.decode(decryptedBytes);
      // Note: The string cannot be wiped, but the bytes are wiped after this callback
    });

    return decryptedString;
  }
}
