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
    const safeAddress = paymentPayload.safeAddress;

    // First, check if the contract exists and has code
    const code = await provider.getCode(safeAddress);
    const isDeployed = !!(code && code !== "0x" && code.length > 2);

    logger.info("Checking Safe deployment status", {
      address: safeAddress,
      hasCode: !!code,
      codeLength: code?.length || 0,
      isDeployed,
    });

    // Compute the transaction hash locally (no contract call needed)
    const txHash = computeSafeTransactionHash(
      safeAddress,
      paymentPayload.safeTx,
      paymentPayload.networkId
    );

    logger.debug("Safe transaction hash (computed locally)", { txHash });

    // Get Safe owners and threshold
    let owners: string[];
    let threshold: bigint;
    
    if (isDeployed) {
      // Safe is deployed - get owners and threshold from on-chain
      logger.info("Safe is deployed, fetching owners and threshold from chain", {
        address: safeAddress,
        codeLength: code.length,
      });

      const safeContract = new Contract(
        safeAddress,
        SAFE_ABI,
        provider
      );
      
      try {
        owners = await safeContract.getOwners();
        threshold = await safeContract.getThreshold();
        logger.info("Successfully fetched Safe configuration from chain", {
          ownersCount: owners.length,
          threshold: threshold.toString(),
        });
      } catch (error) {
        // If the call fails, it might mean the contract doesn't have these methods
        // (i.e., it's not a Safe contract) or the RPC returned empty data
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to call Safe contract methods", {
          address: safeAddress,
          error: errorMessage,
        });
        
        // Check if it's the specific "could not decode result data" error
        if (errorMessage.includes("could not decode result data") || errorMessage.includes("BAD_DATA")) {
          return {
            valid: false,
            reason: `Contract at ${safeAddress} does not appear to be a Safe contract. The contract exists but does not have the getOwners() or getThreshold() methods. This address may not be a Safe wallet.`,
          };
        }
        
        return {
          valid: false,
          reason: `Failed to call Safe contract methods at ${safeAddress}: ${errorMessage}`,
        };
      }
    } else {
      // Safe is not deployed (counterfactual Safe) - use owner from payload
      // For counterfactual Safes, we use the owner from safeTx.from
      // The extension creates 1-of-1 Safes, so threshold is 1
      logger.info("Safe not deployed (counterfactual), using owner from payload", {
        address: safeAddress,
        owner: paymentPayload.safeTx.from,
      });
      
      if (!paymentPayload.safeTx.from) {
        logger.error("Cannot verify counterfactual Safe: safeTx.from is missing", {
          safeTx: paymentPayload.safeTx,
        });
        return {
          valid: false,
          reason: `Cannot verify counterfactual Safe: safeTx.from is missing from payload`,
        };
      }
      
      owners = [paymentPayload.safeTx.from];
      threshold = 1n; // Extension creates 1-of-1 Safes
      
      logger.info("Using counterfactual Safe configuration", {
        owners,
        threshold: threshold.toString(),
      });
    }

    logger.debug("Safe configuration", {
      owners,
      threshold: threshold.toString(),
    });

    // Parse signatures (each signature is 65 bytes)
    let sigBytes: Uint8Array;
    try {
      sigBytes = getBytes(paymentPayload.signatures);
    } catch (error) {
      logger.error("Failed to parse signatures", {
        signatures: paymentPayload.signatures?.substring(0, 100),
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        valid: false,
        reason: `Invalid signatures format: ${error instanceof Error ? error.message : String(error)}. Received: ${typeof paymentPayload.signatures === 'string' ? paymentPayload.signatures.substring(0, 100) + '...' : String(paymentPayload.signatures)}`,
      };
    }
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