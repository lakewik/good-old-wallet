#!/usr/bin/env bun

/**
 * Test script to encrypt/decrypt seed phrases using the same algorithm as the wallet
 * 
 * Usage:
 *   bun tools/test-encryption.ts encrypt "your seed phrase" "your password"
 *   bun tools/test-encryption.ts decrypt <salt-hex> <iv-hex> <ciphertext-hex> "your password"
 */

interface EncryptedVault {
  cipherText: number[];
  iv: number[];
  salt: number[];
}

class WalletVault {
  private readonly PBKDF2_ITERATIONS = 100000;
  private readonly SALT_LENGTH = 16;
  private readonly IV_LENGTH = 12;

  private async getPasswordKey(password: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    return crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
  }

  private async deriveKey(
    passwordKey: CryptoKey,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: this.PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async encryptWallet(
    password: string,
    seedPhrase: string
  ): Promise<EncryptedVault> {
    if (!password || password.length === 0) {
      throw new Error("Password cannot be empty");
    }

    if (!seedPhrase || seedPhrase.trim().length === 0) {
      throw new Error("Seed phrase cannot be empty");
    }

    const salt = crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

    const passwordKey = await this.getPasswordKey(password);
    const aesKey = await this.deriveKey(passwordKey, salt);

    const enc = new TextEncoder();
    const seedPhraseBuffer = enc.encode(seedPhrase.trim());

    try {
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        aesKey,
        seedPhraseBuffer
      );

      seedPhraseBuffer.fill(0);

      return {
        cipherText: Array.from(new Uint8Array(encryptedBuffer)),
        iv: Array.from(iv),
        salt: Array.from(salt),
      };
    } catch (error) {
      seedPhraseBuffer.fill(0);
      throw new Error(
        `Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async decryptWallet(
    password: string,
    vault: EncryptedVault
  ): Promise<string> {
    if (!password || password.length === 0) {
      throw new Error("Password cannot be empty");
    }

    const salt = new Uint8Array(vault.salt);
    const iv = new Uint8Array(vault.iv);
    const data = new Uint8Array(vault.cipherText);

    try {
      const passwordKey = await this.getPasswordKey(password);
      const aesKey = await this.deriveKey(passwordKey, salt);

      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        aesKey,
        data
      );

      const decoder = new TextDecoder();
      const decryptedString = decoder.decode(decryptedBuffer);

      // Zero out the buffer
      new Uint8Array(decryptedBuffer).fill(0);

      return decryptedString;
    } catch (error) {
      if (error instanceof Error && error.message.includes("decryption")) {
        throw new Error("Incorrect password or corrupted vault");
      }
      throw error;
    }
  }
}

// Helper functions
function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "encrypt") {
    const seedPhrase = args[1];
    const password = args[2];

    if (!seedPhrase || !password) {
      console.error("Usage: bun tools/test-encryption.ts encrypt <seed-phrase> <password>");
      process.exit(1);
    }

    try {
      const vault = new WalletVault();
      const encrypted = await vault.encryptWallet(password, seedPhrase);

      console.log("\n✅ Encryption successful!\n");
      console.log("Encrypted Vault Data:");
      console.log("====================");
      console.log(`Salt:    ${bytesToHex(encrypted.salt)}`);
      console.log(`IV:      ${bytesToHex(encrypted.iv)}`);
      console.log(`Cipher:  ${bytesToHex(encrypted.cipherText)}`);
      console.log("\nCopy these values to compare with the app output.\n");
    } catch (error) {
      console.error("❌ Encryption failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } else if (command === "decrypt") {
    const saltHex = args[1];
    const ivHex = args[2];
    const cipherHex = args[3];
    const password = args[4];

    if (!saltHex || !ivHex || !cipherHex || !password) {
      console.error(
        "Usage: bun tools/test-encryption.ts decrypt <salt-hex> <iv-hex> <ciphertext-hex> <password>"
      );
      process.exit(1);
    }

    try {
      const vault: EncryptedVault = {
        salt: hexToBytes(saltHex),
        iv: hexToBytes(ivHex),
        cipherText: hexToBytes(cipherHex),
      };

      const walletVault = new WalletVault();
      const decrypted = await walletVault.decryptWallet(password, vault);

      console.log("\n✅ Decryption successful!\n");
      console.log("Decrypted Seed Phrase:");
      console.log("======================");
      console.log(decrypted);
      console.log("\n✅ The encrypted data matches! Your wallet encryption is working correctly.\n");
    } catch (error) {
      console.error("❌ Decryption failed:", error instanceof Error ? error.message : error);
      console.error("\nThis could mean:");
      console.error("  - Wrong password");
      console.error("  - Corrupted vault data");
      console.error("  - Data from different encryption\n");
      process.exit(1);
    }
  } else {
    console.log("Wallet Encryption Test Tool");
    console.log("==========================\n");
    console.log("Encrypt a seed phrase:");
    console.log('  bun tools/test-encryption.ts encrypt "your seed phrase" "your password"\n');
    console.log("Decrypt vault data (from app):");
    console.log(
      '  bun tools/test-encryption.ts decrypt <salt> <iv> <ciphertext> "your password"\n'
    );
    console.log("Example:");
    console.log(
      '  bun tools/test-encryption.ts encrypt "word1 word2 word3..." "mypassword123"\n'
    );
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

