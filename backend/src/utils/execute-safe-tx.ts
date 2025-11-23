import { Wallet, Contract, JsonRpcProvider, recoverAddress, Signature, getBytes } from "ethers";
import Safe from "@safe-global/protocol-kit";
import { logger } from "../setup/logger.js";
import { SAFE_ABI, computeSafeTransactionHash } from "./compute-safe-tx-hash.js";
import { CHAINS } from "../setup/chains.js";
import type { EvmSafeWcrcPaymentPayload, SettleResult } from "../services/x402.js";

/**
 * Execute a Safe transaction on-chain
 * Uses the EXACT transaction parameters that were signed by the client
 * 
 * @param wallet - The wallet to send the transaction from (facilitator)
 * @param paymentPayload - The payment payload containing safeTx details and signatures
 * @param provider - The RPC provider for the network
 * @returns SettleResult indicating success/failure with tx details
 */
export async function executeSafeTx(
  wallet: Wallet,
  paymentPayload: EvmSafeWcrcPaymentPayload,
  provider: JsonRpcProvider
): Promise<SettleResult> {
  
  logger.info("🔍 Execution Debug Info:", {
    safeAddress: paymentPayload.safeAddress,
    facilitatorAddress: wallet.address,
    signaturesLength: paymentPayload.signatures.length,
    signaturesPreview: paymentPayload.signatures.substring(0, 66) + "...",
    to: paymentPayload.safeTx.to,
    value: paymentPayload.safeTx.value,
    operation: paymentPayload.safeTx.operation,
    nonce: paymentPayload.safeTx.nonce,
  });

  try {
    // Check if Safe is deployed, and deploy if needed
    const code = await provider.getCode(paymentPayload.safeAddress);
    const isDeployed = !!(code && code !== "0x" && code.length > 2);

    if (!isDeployed) {
      logger.info("🚀 Safe not deployed, deploying now...", {
        safeAddress: paymentPayload.safeAddress,
        owner: paymentPayload.safeTx.from,
      });

      // Deploy the Safe using Safe SDK
      // The extension creates 1-of-1 Safes with saltNonce "0"
      // Get RPC URL from CHAINS config
      const chainConfig = CHAINS[paymentPayload.networkId as keyof typeof CHAINS];
      if (!chainConfig) {
        return {
          settled: false,
          reason: `Chain configuration not found for networkId ${paymentPayload.networkId}`,
        };
      }
      
      const safe = await Safe.init({
        provider: chainConfig.rpcUrl,
        signer: wallet.privateKey,
        predictedSafe: {
          safeAccountConfig: {
            owners: [paymentPayload.safeTx.from],
            threshold: 1,
          },
          safeDeploymentConfig: {
            saltNonce: "0", // Extension uses "0" as deterministic salt
          },
        },
      });

      // Verify the address matches
      const predictedAddress = await safe.getAddress();
      if (predictedAddress.toLowerCase() !== paymentPayload.safeAddress.toLowerCase()) {
        logger.error("Safe address mismatch", {
          predicted: predictedAddress,
          provided: paymentPayload.safeAddress,
        });
        return {
          settled: false,
          reason: `Safe address mismatch: predicted ${predictedAddress}, but payload has ${paymentPayload.safeAddress}`,
        };
      }

      // Deploy the Safe
      const deploymentTx = await safe.createSafeDeploymentTransaction();
      logger.info("📤 Deploying Safe contract...", {
        to: deploymentTx.to,
        dataLength: deploymentTx.data?.length || 0,
      });

      const deployTxResponse = await wallet.sendTransaction({
        to: deploymentTx.to,
        data: deploymentTx.data,
        value: deploymentTx.value || 0n,
      });

      logger.info("⏳ Waiting for Safe deployment...", { hash: deployTxResponse.hash });
      const deployReceipt = await deployTxResponse.wait();
      logger.info("✅ Safe deployed successfully!", {
        txHash: deployTxResponse.hash,
        safeAddress: paymentPayload.safeAddress,
        blockNumber: deployReceipt.blockNumber,
      });

      // Verify the Safe nonce is 0 after deployment
      const deployedSafeContract = new Contract(
        paymentPayload.safeAddress,
        SAFE_ABI,
        wallet
      );
      const currentNonce = await deployedSafeContract.nonce();
      logger.info("📋 Safe nonce after deployment", {
        nonce: currentNonce.toString(),
        expectedNonce: paymentPayload.safeTx.nonce,
      });

      if (currentNonce.toString() !== paymentPayload.safeTx.nonce) {
        logger.warn("⚠️ Nonce mismatch - transaction was signed with different nonce", {
          currentNonce: currentNonce.toString(),
          signedNonce: paymentPayload.safeTx.nonce,
        });
        // For a freshly deployed Safe, nonce should be 0
        // If the transaction was signed with nonce 0, this should match
      }
    } else {
      logger.info("✅ Safe already deployed", { safeAddress: paymentPayload.safeAddress });
      
      // Check current nonce for deployed Safe
      const deployedSafeContract = new Contract(
        paymentPayload.safeAddress,
        SAFE_ABI,
        wallet
      );
      const currentNonce = await deployedSafeContract.nonce();
      logger.info("📋 Safe current nonce", {
        nonce: currentNonce.toString(),
        expectedNonce: paymentPayload.safeTx.nonce,
      });
    }

    // Create Safe contract instance
    const safeContract = new Contract(
      paymentPayload.safeAddress,
      SAFE_ABI,
      wallet
    );

    // Get original signature from payload
    let signatures = paymentPayload.signatures.startsWith('0x') 
      ? paymentPayload.signatures 
      : `0x${paymentPayload.signatures}`;

    logger.info("📝 Original signature from payload", {
      length: signatures.length,
      preview: signatures.substring(0, 66) + "...",
    });

    // Verify signature and prepare it for contract call
    const computedTxHash = computeSafeTransactionHash(
      paymentPayload.safeAddress,
      paymentPayload.safeTx,
      paymentPayload.networkId
    );

    // Verify transaction hash matches what Safe computes on-chain
    // This is critical - if the hash doesn't match, the signature won't work
    try {
      // Get RPC URL from CHAINS config
      const chainConfig = CHAINS[paymentPayload.networkId as keyof typeof CHAINS];
      if (chainConfig) {
        const safeSdk = await Safe.init({
          provider: chainConfig.rpcUrl,
          signer: wallet.privateKey,
          safeAddress: paymentPayload.safeAddress,
        });
        
        // Reconstruct the transaction in the format Safe SDK expects
        // Safe SDK expects string values for numbers
        const safeTxForHash = {
          to: paymentPayload.safeTx.to,
          value: typeof paymentPayload.safeTx.value === 'string' ? paymentPayload.safeTx.value : paymentPayload.safeTx.value.toString(),
          data: paymentPayload.safeTx.data || "0x",
          operation: paymentPayload.safeTx.operation,
          safeTxGas: typeof paymentPayload.safeTx.safeTxGas === 'string' ? paymentPayload.safeTx.safeTxGas : paymentPayload.safeTx.safeTxGas.toString(),
          baseGas: typeof paymentPayload.safeTx.baseGas === 'string' ? paymentPayload.safeTx.baseGas : paymentPayload.safeTx.baseGas.toString(),
          gasPrice: typeof paymentPayload.safeTx.gasPrice === 'string' ? paymentPayload.safeTx.gasPrice : paymentPayload.safeTx.gasPrice.toString(),
          gasToken: paymentPayload.safeTx.gasToken,
          refundReceiver: paymentPayload.safeTx.refundReceiver,
          nonce: BigInt(paymentPayload.safeTx.nonce),
        };
        
        logger.debug("Safe transaction for hash computation", {
          to: safeTxForHash.to,
          value: safeTxForHash.value,
          dataLength: safeTxForHash.data?.length || 0,
          operation: safeTxForHash.operation,
          nonce: safeTxForHash.nonce.toString(),
        });
        
        const onChainTxHash = await safeSdk.getTransactionHash(safeTxForHash);
        
        logger.info("🔍 Transaction hash comparison", {
          computedHash: computedTxHash,
          onChainHash: onChainTxHash,
          match: computedTxHash.toLowerCase() === onChainTxHash.toLowerCase(),
        });
        
        if (computedTxHash.toLowerCase() !== onChainTxHash.toLowerCase()) {
          logger.error("❌ Transaction hash mismatch!", {
            computed: computedTxHash,
            onChain: onChainTxHash,
            safeTx: safeTxForHash,
          });
          return {
            settled: false,
            reason: `Transaction hash mismatch: computed ${computedTxHash}, but Safe contract computes ${onChainTxHash}. This means the signature was signed for a different transaction.`,
          };
        }
        
        logger.info("✅ Transaction hash matches Safe's on-chain computation");
      }
    } catch (error) {
      logger.warn("⚠️ Could not verify transaction hash with Safe SDK", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Continue anyway - our computed hash should be correct
      // But this might be why GS013 is happening
    }
    
    // Parse signature to check v value and adjust if needed for contract
    const sigHex = signatures.startsWith('0x') ? signatures.substring(2) : signatures;
    if (sigHex.length < 130) {
      return {
        settled: false,
        reason: `Invalid signature length: expected at least 130 hex characters (65 bytes), got ${sigHex.length}`,
      };
    }

    const r = `0x${sigHex.substring(0, 64)}`;
    const s = `0x${sigHex.substring(64, 128)}`;
    let v = parseInt(sigHex.substring(128, 130), 16);

    logger.info("📝 Signature components:", {
      r: r.substring(0, 20) + "...",
      s: s.substring(0, 20) + "...",
      v: v,
    });

    // Safe contract requires v to be 27 or 28
    // Only adjust and reconstruct if v < 27
    // If v is already 27 or 28, use the original signature as-is
    const originalV = v;
    if (v < 27) {
      v = v + 27;
      // Reconstruct signature with adjusted v value
      // Format: 0x + r (64 hex chars) + s (64 hex chars) + v (2 hex chars)
      const rHex = r.startsWith('0x') ? r.substring(2) : r;
      const sHex = s.startsWith('0x') ? s.substring(2) : s;
      const vHex = v.toString(16).padStart(2, '0');
      signatures = `0x${rHex}${sHex}${vHex}`;
      
      logger.info("🔧 Adjusted signature v for contract", {
        originalV: originalV,
        adjustedV: v,
        signatureLength: signatures.length,
        signaturePreview: signatures.substring(0, 66) + "...",
        signatureEnd: "..." + signatures.substring(signatures.length - 10),
      });
    } else {
      // v is already 27 or 28, use original signature as-is
      logger.info("✅ Signature v is already correct (27 or 28), using original", {
        v: v,
        signatureLength: signatures.length,
        signaturePreview: signatures.substring(0, 66) + "...",
      });
    }

    // Verify signature recovery with adjusted v
    const sig = Signature.from({ r, s, v });
    const recoveredAddress = recoverAddress(computedTxHash, sig);
    
    logger.info("🔍 Signature recovery check", {
      recoveredAddress,
      expectedOwner: paymentPayload.safeTx.from,
      matches: recoveredAddress.toLowerCase() === paymentPayload.safeTx.from.toLowerCase(),
      v: v,
    });

    if (recoveredAddress.toLowerCase() !== paymentPayload.safeTx.from.toLowerCase()) {
      return {
        settled: false,
        reason: `Signature recovery failed: recovered ${recoveredAddress}, expected ${paymentPayload.safeTx.from}`,
      };
    }

    // Verify the recovered address is a Safe owner
    const owners = await safeContract.getOwners();
    const ownerSet = new Set(owners.map((o: string) => o.toLowerCase()));
    if (!ownerSet.has(recoveredAddress.toLowerCase())) {
      return {
        settled: false,
        reason: `Recovered signer ${recoveredAddress} is not a Safe owner. Owners: ${owners.join(', ')}`,
      };
    }

    logger.info("✅ Signature validation passed", {
      recoveredAddress,
      isOwner: true,
      finalV: v,
    });

    // Log all transaction parameters for debugging
    logger.info("📋 Transaction parameters for execTransaction", {
      to: paymentPayload.safeTx.to,
      value: paymentPayload.safeTx.value,
      data: paymentPayload.safeTx.data.substring(0, 66) + "...",
      operation: paymentPayload.safeTx.operation,
      safeTxGas: paymentPayload.safeTx.safeTxGas,
      baseGas: paymentPayload.safeTx.baseGas,
      gasPrice: paymentPayload.safeTx.gasPrice,
      gasToken: paymentPayload.safeTx.gasToken,
      refundReceiver: paymentPayload.safeTx.refundReceiver,
      nonce: paymentPayload.safeTx.nonce,
      signature: signatures,
      signatureLength: signatures.length,
    });

    // Convert all parameters to proper types (BigInt for numbers, ensure addresses are checksummed)
    const to = paymentPayload.safeTx.to;
    const value = BigInt(paymentPayload.safeTx.value);
    const data = paymentPayload.safeTx.data;
    const operation = paymentPayload.safeTx.operation;
    const safeTxGas = BigInt(paymentPayload.safeTx.safeTxGas);
    const baseGas = BigInt(paymentPayload.safeTx.baseGas);
    const gasPrice = BigInt(paymentPayload.safeTx.gasPrice);
    const gasToken = paymentPayload.safeTx.gasToken;
    const refundReceiver = paymentPayload.safeTx.refundReceiver;
    
    // Convert signature to bytes - Safe contract expects bytes type
    // ethers will handle the hex string to bytes conversion, but let's be explicit
    let signatureBytes: string;
    if (signatures.startsWith('0x')) {
      signatureBytes = signatures;
    } else {
      signatureBytes = `0x${signatures}`;
    }

    // Verify the signature is exactly 65 bytes (130 hex chars)
    const signatureHex = signatureBytes.substring(2);
    if (signatureHex.length !== 130) {
      return {
        settled: false,
        reason: `Invalid signature length: expected exactly 130 hex characters (65 bytes), got ${signatureHex.length}`,
      };
    }

    logger.info("📋 Converted transaction parameters", {
      to,
      value: value.toString(),
      operation,
      safeTxGas: safeTxGas.toString(),
      baseGas: baseGas.toString(),
      gasPrice: gasPrice.toString(),
      gasToken,
      refundReceiver,
      signatureLength: signatureBytes.length,
      signatureHexLength: signatureHex.length,
      expectedHexLength: 130,
    });

    // Log the exact call we're making for debugging
    logger.info("📞 Calling execTransaction with:", {
      to,
      value: value.toString(),
      dataLength: data.length,
      operation,
      safeTxGas: safeTxGas.toString(),
      baseGas: baseGas.toString(),
      gasPrice: gasPrice.toString(),
      gasToken,
      refundReceiver,
      signatureLength: signatureBytes.length,
      signature: signatureBytes,
    });

    // Estimate gas with signature (v adjusted if needed)
    logger.info("⚡ Estimating gas...");
    let gasEstimate: bigint;
    try {
      // Pass signature as hex string - ethers will encode it as bytes
      gasEstimate = await safeContract.execTransaction.estimateGas(
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        signatureBytes
      );
      
      // Add 20% buffer
      gasEstimate = (gasEstimate * 120n) / 100n;
      logger.info("✅ Gas estimated", { gasEstimate: gasEstimate.toString() });
    } catch (error) {
      logger.error("❌ Gas estimation failed", error);
      return {
        settled: false,
        reason: `Gas estimation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Execute transaction with signature (v adjusted if needed)
    logger.info("📤 Executing transaction...");
    
    const tx = await safeContract.execTransaction(
      to,
      value,
      data,
      operation,
      safeTxGas,
      baseGas,
      gasPrice,
      gasToken,
      refundReceiver,
      signatureBytes,
      {
        gasLimit: gasEstimate,
      }
    );

    logger.info("✅ Transaction sent", { hash: tx.hash });

    // Wait for confirmation
    logger.info("⏳ Waiting for confirmation...");
    const receipt = await tx.wait(1);

    if (!receipt) {
      return {
        settled: false,
        reason: "Transaction not confirmed - no receipt received",
      };
    }

    if (receipt.status === 0) {
      return {
        settled: false,
        reason: "Transaction reverted on-chain",
      };
    }

    logger.info("✅ Transaction execution successful", {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed?.toString(),
    });

    return {
      settled: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber.toString(),
    };

  } catch (error) {
    logger.error("❌ Transaction execution failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      settled: false,
      reason: `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
