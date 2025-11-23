/**
 * Filecoin Backup Utility
 * Handles encryption and storage of account data on Filecoin network
 */

import { Synapse, RPC_URLS, TOKENS, TIME_CONSTANTS, CONTRACT_ABIS, CONTRACT_ADDRESSES, getFilecoinNetworkType } from "@filoz/synapse-sdk";
import { ethers } from "ethers";
import { deriveWalletFromPhrase } from "./accountManager";
import { getAccountIndices, getAllAccountColors, getAllAccountNames } from "./storage";
import { WalletVault } from "./WalletVault";
import type { EncryptedVault } from "./WalletVault";
import { API_BASE_URL } from "../constants";

interface AccountData {
  walletIdentifier: string; // Tag to identify this wallet
  version: string; // Backup format version
  indices: number[];
  colors: Record<number, string>;
  names: Record<number, string>;
  timestamp: number; // When backup was created
}

/**
 * Encrypt account data using AES-GCM with a key derived from the private key
 */
async function encryptAccountData(data: AccountData, privateKey: string): Promise<Uint8Array> {
  // Convert private key to a key for encryption
  // We'll use the private key's hash as the encryption key
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(privateKey),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const dataJson = JSON.stringify(data);
  const dataBuffer = new TextEncoder().encode(dataJson);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    encryptionKey,
    dataBuffer
  );

  // Combine salt, iv, and encrypted data
  const encryptedData = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
  encryptedData.set(salt, 0);
  encryptedData.set(iv, salt.length);
  encryptedData.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);

  // Add wallet identifier tag and padding to meet minimum 127 bytes requirement
  const MIN_SIZE = 127;
  const WALLET_TAG = "GOOD_OLD_WALLET_BACKUP_V1"; // 25 bytes
  const tagBuffer = new TextEncoder().encode(WALLET_TAG);
  
  // Calculate padding needed
  const currentSize = encryptedData.length + tagBuffer.length;
  const paddingNeeded = Math.max(0, MIN_SIZE - currentSize);
  
  // Create final buffer with tag, encrypted data, and padding
  const finalBuffer = new Uint8Array(tagBuffer.length + encryptedData.length + paddingNeeded);
  finalBuffer.set(tagBuffer, 0);
  finalBuffer.set(encryptedData, tagBuffer.length);
  
  // Add padding (zeros) if needed
  if (paddingNeeded > 0) {
    finalBuffer.fill(0, tagBuffer.length + encryptedData.length);
  }

  return finalBuffer;
}

/**
 * Decrypt account data using AES-GCM with a key derived from the private key
 */
async function decryptAccountData(encryptedData: Uint8Array, privateKey: string): Promise<AccountData> {
  // Extract tag, salt, iv, and encrypted data
  // Structure: [TAG (25 bytes)][SALT (16 bytes)][IV (12 bytes)][ENCRYPTED (variable)][PADDING (zeros)]
  const WALLET_TAG = "GOOD_OLD_WALLET_BACKUP_V1";
  const tagLength = WALLET_TAG.length;
  const saltLength = 16;
  const ivLength = 12;
  
  // Check if the data starts with the wallet tag
  const tagBytes = encryptedData.slice(0, tagLength);
  const tag = new TextDecoder().decode(tagBytes);
  
  if (tag !== WALLET_TAG) {
    throw new Error("Invalid backup data: missing wallet identifier tag");
  }
  
  // Structure is: TAG | SALT | IV | ENCRYPTED | PADDING
  // So salt starts right after tag
  const saltStart = tagLength;
  const ivStart = saltStart + saltLength;
  const encryptedStart = ivStart + ivLength;
  
  if (encryptedStart > encryptedData.length) {
    throw new Error("Invalid backup data: insufficient data length");
  }
  
  // Extract salt and IV
  const salt = encryptedData.slice(saltStart, ivStart);
  const iv = encryptedData.slice(ivStart, encryptedStart);
  
  // Find where encrypted content ends (before padding zeros at the end)
  // AES-GCM encrypted data includes a 16-byte authentication tag
  // We need to find the exact encrypted length by trying to decrypt
  let encryptedEnd = encryptedData.length;
  
  // Remove trailing zeros (padding)
  while (encryptedEnd > encryptedStart && encryptedData[encryptedEnd - 1] === 0) {
    encryptedEnd--;
  }
  
  if (encryptedEnd <= encryptedStart) {
    throw new Error("Invalid backup data: no encrypted content found");
  }
  
  // Try to find the correct encrypted length by attempting decryption
  // Start from the end and work backwards if decryption fails
  let encrypted = encryptedData.slice(encryptedStart, encryptedEnd);
  let lastError: Error | null = null;
  
  // Derive decryption key once
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(privateKey),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const decryptionKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  // Try decrypting - if it fails, the encrypted data might include some padding
  // AES-GCM will throw if the data is corrupted or includes extra bytes
  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      decryptionKey,
      encrypted
    );
  } catch (error) {
    // If decryption fails, try removing more bytes from the end
    // This handles cases where some padding zeros might have been included
    throw new Error(`Failed to decrypt backup data: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  // Parse JSON
  const dataJson = new TextDecoder().decode(decryptedBuffer);
  const accountData = JSON.parse(dataJson) as AccountData;
  
  // Validate wallet identifier
  if (accountData.walletIdentifier !== "good-old-wallet-backup") {
    throw new Error("Invalid backup data: wallet identifier mismatch");
  }
  
  return accountData;
}

/**
 * Restore account data from Filecoin backup
 */
export async function restoreFromFilecoin(
  seedPhrase: string,
  onProgress?: (message: string) => void
): Promise<AccountData | null> {
  try {
    // Derive account 0 address
    onProgress?.("Attempting to search for Filecoin backup...");
    const { address: account0Address } = await deriveWalletFromPhrase(seedPhrase, 0);
    
    // Get latest CID from backend
    onProgress?.("Retrieving Filecoin backup...");
    const response = await fetch(`${API_BASE_URL}/latest-cid/${account0Address}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      console.log("No backup found for this wallet");
      return null;
    }
    
    const cidData = await response.json();
    
    if (!cidData.success || !cidData.url) {
      console.log("No backup URL found");
      return null;
    }
    
    // Download encrypted data from Filecoin
    onProgress?.("Retrieving Filecoin backup...");
    const downloadResponse = await fetch(cidData.url);
    if (!downloadResponse.ok) {
      throw new Error(`Failed to download backup: ${downloadResponse.statusText}`);
    }
    
    const encryptedArrayBuffer = await downloadResponse.arrayBuffer();
    const encryptedData = new Uint8Array(encryptedArrayBuffer);
    
    // Get private key from account 0
    const { wallet } = await deriveWalletFromPhrase(seedPhrase, 0);
    const account0PrivateKey = wallet.privateKey;
    
    // Decrypt the account data
    onProgress?.("Decrypting Filecoin backup...");
    const accountData = await decryptAccountData(encryptedData, account0PrivateKey);
    
    console.log("✅ Successfully restored account data from Filecoin backup");
    return accountData;
  } catch (error) {
    console.error("Error restoring from Filecoin backup:", error);
    // Don't throw - if restore fails, just continue without backup data
    return null;
  }
}

/**
 * Backup account data to Filecoin
 */
export async function backupToFilecoin(
  password: string,
  encryptedVault: EncryptedVault
): Promise<{ pieceCid: string; size: number }> {
  const vault = new WalletVault();
  
  // Get account data
  const [indices, colors, names] = await Promise.all([
    getAccountIndices(),
    getAllAccountColors(),
    getAllAccountNames(),
  ]);

  const accountData: AccountData = {
    walletIdentifier: "good-old-wallet-backup",
    version: "1.0.0",
    indices,
    colors,
    names,
    timestamp: Date.now(),
  };

  // Get private key from account 0
  let account0PrivateKey = "";
  await vault.unlockAndExecute(
    password,
    encryptedVault,
    async (seedPhraseBytes) => {
      const decoder = new TextDecoder();
      const seedPhrase = decoder.decode(seedPhraseBytes);
      const { wallet } = await deriveWalletFromPhrase(seedPhrase, 0);
      account0PrivateKey = wallet.privateKey;
    }
  );

  // Encrypt the account data
  const encryptedData = await encryptAccountData(accountData, account0PrivateKey);

  // Initialize Synapse SDK with account 0 private key
  const synapse = await Synapse.create({
    privateKey: account0PrivateKey,
    rpcURL: RPC_URLS.calibration.http,
  });

  // Check and deposit if needed
  const signerAddress = await synapse.getSigner().getAddress();
  const provider = synapse.getProvider();
  const minimumDeposit = ethers.parseUnits("0.07", 18); // 0.07 USDC

  const network = await getFilecoinNetworkType(provider);
  const paymentsAddress = synapse.getPaymentsAddress();
  const usdfcAddress = CONTRACT_ADDRESSES.USDFC[network];

  const paymentsContract = new ethers.Contract(
    paymentsAddress,
    CONTRACT_ABIS.PAYMENTS,
    provider
  );

  let currentDeposit = 0n;
  try {
    const accountData = await paymentsContract.accounts(usdfcAddress, signerAddress);
    currentDeposit = accountData[0];
  } catch (error) {
    console.log("⚠️  Could not query current deposit balance, assuming 0");
    currentDeposit = 0n;
  }

  const currentDepositFormatted = ethers.formatUnits(currentDeposit, 18);
  console.log(`Current deposit balance: ${currentDepositFormatted} USDFC`);

  if (currentDeposit < minimumDeposit) {
    const depositAmount = minimumDeposit;
    console.log(`Deposit balance (${currentDepositFormatted}) is less than minimum (0.07), depositing...`);
    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
      depositAmount,
      synapse.getWarmStorageAddress(),
      ethers.MaxUint256,
      ethers.MaxUint256,
      TIME_CONSTANTS.EPOCHS_PER_MONTH,
    );
    await tx.wait();
    console.log(`✅ USDFC deposit and Warm Storage service approval successful!`);
  } else {
    console.log(`✅ Sufficient deposit balance (${currentDepositFormatted} >= 0.07), skipping deposit`);
  }

  // Upload encrypted data to Filecoin
  const { pieceCid, size } = await synapse.storage.upload(encryptedData);
  console.log(`✅ Upload complete!`);
  console.log(`PieceCID: ${pieceCid}`);
  console.log(`Size: ${size} bytes`);

  return { pieceCid, size };
}
