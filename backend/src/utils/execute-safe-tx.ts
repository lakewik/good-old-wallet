import { Wallet, Contract } from "ethers";
import { logger } from "../setup/logger.js";
import { SAFE_ABI } from "./compute-safe-tx-hash.js";
import type { EvmSafeWcrcPaymentPayload, SettleResult } from "../services/x402.js";

/**
 * Execute a Safe transaction on-chain
 * Uses the EXACT transaction parameters that were signed by the client
 * 
 * @param wallet - The wallet to send the transaction from (facilitator)
 * @param paymentPayload - The payment payload containing safeTx details and signatures
 * @returns SettleResult indicating success/failure with tx details
 */
export async function executeSafeTx(
  wallet: Wallet,
  paymentPayload: EvmSafeWcrcPaymentPayload
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
    // Create Safe contract instance
    const safeContract = new Contract(
      paymentPayload.safeAddress,
      SAFE_ABI,
      wallet
    );

    // Process the signatures - adjust v value if needed
    // Safe SDK might produce v=0 or v=1, but Safe contract expects v=27 or v=28
    let signatures = paymentPayload.signatures;
    if (!signatures.startsWith('0x')) {
      signatures = `0x${signatures}`;
    }

    // Parse signature components
    const sigHex = signatures.substring(2); // Remove 0x
    const r = `0x${sigHex.substring(0, 64)}`;
    const s = `0x${sigHex.substring(64, 128)}`;
    let v = parseInt(sigHex.substring(128, 130), 16);

    logger.info("📝 Signature components:", {
      r: r.substring(0, 10) + "...",
      s: s.substring(0, 10) + "...",
      v: v,
      vAdjusted: v < 27 ? v + 27 : v
    });

    // Adjust v value: if v is 0 or 1, add 27 to get 27 or 28
    if (v < 27) {
      v = v + 27;
      // Reconstruct signatures with adjusted v
      signatures = r + s.substring(2) + v.toString(16).padStart(2, '0');
      logger.info("🔧 Adjusted signature v value", { newV: v, newSignatures: signatures.substring(0, 66) + "..." });
    }

    // Estimate gas
    logger.info("⚡ Estimating gas...");
    let gasEstimate: bigint;
    try {
      gasEstimate = await safeContract.execTransaction.estimateGas(
        paymentPayload.safeTx.to,
        paymentPayload.safeTx.value,
        paymentPayload.safeTx.data,
        paymentPayload.safeTx.operation,
        paymentPayload.safeTx.safeTxGas,
        paymentPayload.safeTx.baseGas,
        paymentPayload.safeTx.gasPrice,
        paymentPayload.safeTx.gasToken,
        paymentPayload.safeTx.refundReceiver,
        signatures
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

    // Execute transaction
    logger.info("📤 Executing transaction...");
    const tx = await safeContract.execTransaction(
      paymentPayload.safeTx.to,
      paymentPayload.safeTx.value,
      paymentPayload.safeTx.data,
      paymentPayload.safeTx.operation,
      paymentPayload.safeTx.safeTxGas,
      paymentPayload.safeTx.baseGas,
      paymentPayload.safeTx.gasPrice,
      paymentPayload.safeTx.gasToken,
      paymentPayload.safeTx.refundReceiver,
      signatures,
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
