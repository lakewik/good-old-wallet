import { Contract, JsonRpcProvider, getBytes, hexlify, recoverAddress, Signature } from "ethers";
import { computeSafeTransactionHash, SAFE_ABI } from "./compute-safe-tx-hash.js";
import { type EvmSafeWcrcPaymentPayload } from "../services/x402.js";
import { logger } from "../setup/logger.js";

/**
 * Result of Safe signature verification
 */
export interface SignatureVerificationResult {
  valid: boolean;
  reason?: string;
  data?: {
    txHash: string;
    recoveredSigners: string[];
    threshold: number;
    numSignatures: number;
  };
}

/**
 * Verify Safe transaction signatures
 * Returns a result object with validation status and signature details
 */
export async function verifySafeSignature(
  paymentPayload: EvmSafeWcrcPaymentPayload,
  provider: JsonRpcProvider
): Promise<SignatureVerificationResult> {
  try {
    const safeContract = new Contract(
      paymentPayload.safeAddress,
      SAFE_ABI,
      provider
    );

    // Compute the transaction hash locally (no contract call needed)
    const txHash = computeSafeTransactionHash(
      paymentPayload.safeAddress,
      paymentPayload.safeTx,
      paymentPayload.networkId
    );

    logger.debug("Safe transaction hash (computed locally)", { txHash });

    // Get Safe owners and threshold
    const owners = await safeContract.getOwners();
    const threshold = await safeContract.getThreshold();

    logger.debug("Safe configuration", {
      owners,
      threshold: threshold.toString(),
    });

    // Parse signatures (each signature is 65 bytes)
    const sigBytes = getBytes(paymentPayload.signatures);
    const numSigs = sigBytes.length / 65;

    if (numSigs < threshold) {
      return {
        valid: false,
        reason: `Not enough signatures: provided ${numSigs}, required ${threshold}`,
      };
    }

    // Verify each signature
    const recoveredSigners = new Set<string>();

    for (let i = 0; i < numSigs; i++) {
      const offset = i * 65;
      const r = hexlify(sigBytes.slice(offset, offset + 32));
      const s = hexlify(sigBytes.slice(offset + 32, offset + 64));
      const v = sigBytes[offset + 64];

      // Recover signer from signature
      const signature = Signature.from({ r, s, v });
      const recoveredAddress = recoverAddress(txHash, signature);

      recoveredSigners.add(recoveredAddress.toLowerCase());
    }

    // Check that all recovered signers are Safe owners
    const ownerSet = new Set(owners.map((o: string) => o.toLowerCase()));

    for (const signer of recoveredSigners) {
      if (!ownerSet.has(signer)) {
        return {
          valid: false,
          reason: `Invalid signer - not a Safe owner: ${signer}`,
        };
      }
    }

    const recoveredSignersArray = Array.from(recoveredSigners);
    logger.info("Signature verification successful", {
      recoveredSigners: recoveredSignersArray,
      threshold: threshold.toString(),
      numSignatures: numSigs,
    });

    // All validations passed
    return {
      valid: true,
      data: {
        txHash,
        recoveredSigners: recoveredSignersArray,
        threshold: Number(threshold),
        numSignatures: numSigs,
      },
    };
  } catch (error) {
    logger.error("Error verifying Safe signatures", error);
    return {
      valid: false,
      reason: `Signature verification failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}