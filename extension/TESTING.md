# Testing Ethereum Transaction Signing

This document explains how to verify that your wallet can successfully sign Ethereum transactions.

## ✅ Comprehensive Test (Recommended)

The `test-ethereum-signing.ts` script tests the **entire flow**:

1. ✅ Encrypts seed phrase
2. ✅ Decrypts seed phrase
3. ✅ Derives Ethereum private key from seed phrase
4. ✅ Signs a test message
5. ✅ Verifies the signature

### Run the Test

```bash
bun tools/test-ethereum-signing.ts "your seed phrase here" "your password"
```

### Example

```bash
bun tools/test-ethereum-signing.ts "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12" "mypassword123"
```

### Expected Output

You should see:

- ✅ Encryption successful
- ✅ Decryption successful (matches original)
- ✅ Ethereum key derived successfully (with address)
- ✅ Transaction signed successfully
- ✅ Signature verified successfully

If all steps pass, **you can sign Ethereum transactions with 100% confidence**.

---

## 🔄 Cross-Platform Verification

### Step 1: Encrypt in Browser Extension

1. Open your extension popup
2. Enter a seed phrase
3. Enter a password
4. Click "Import Seed Phrase"
5. On the success screen, you'll see:
   - Encrypted vault data (Salt, IV, CipherText)
   - **Transaction signing test results** (Address, Signature, Verification status)

### Step 2: Verify with Command Line

Copy the Salt, IV, and CipherText from the success screen, then run:

```bash
bun tools/test-encryption.ts decrypt <salt-hex> <iv-hex> <ciphertext-hex> "your password"
```

This will decrypt and show your original seed phrase, proving the encryption works.

### Step 3: Test Signing

Run the comprehensive test:

```bash
bun tools/test-ethereum-signing.ts "your seed phrase" "your password"
```

This will verify that:

- The seed phrase can be encrypted/decrypted
- An Ethereum private key can be derived
- Transactions can be signed
- Signatures can be verified

---

## 🎯 What Gets Tested

### Encryption/Decryption

- Uses PBKDF2 with 100,000 iterations
- Uses AES-GCM for encryption
- Memory wiping after use

### Key Derivation

- Derives Ethereum private key from BIP39 mnemonic
- Uses standard Ethereum derivation path (m/44'/60'/0'/0/0)

### Transaction Signing

- Signs a test message using EIP-191 standard
- Verifies signature can be recovered
- Confirms recovered address matches original

---

## 🔒 Security Notes

- The test scripts use the **exact same algorithms** as the browser extension
- Private keys are wiped from memory after use
- The browser extension automatically tests signing on the success screen
- All tests use standard Ethereum libraries (ethers.js)

---

## ✅ Success Criteria

Your wallet is ready for production if:

1. ✅ `test-ethereum-signing.ts` passes all 5 steps
2. ✅ Browser extension success screen shows verified signature
3. ✅ Command-line decryption matches browser encryption
4. ✅ Same seed phrase + password produces same Ethereum address

If all criteria are met, **you can sign Ethereum transactions with 100% confidence**.
