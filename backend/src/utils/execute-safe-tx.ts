import { Contract, Wallet } from "ethers";
import { logger } from "../setup/logger.js";
import { SAFE_ABI } from "./compute-safe-tx-hash.js";
import type { EvmSafeWcrcPaymentPayload, SettleResult } from "../services/x402.js";

/**
 * Execute a Safe transaction on-chain
 * Handles contract instantiation, gas estimation, transaction execution, and confirmation
 * 
 * @param wallet - The wallet to send the transaction from (facilitator)
 * @param paymentPayload - The payment payload containing safeTx details
 * @returns SettleResult indicating success/failure with tx details
 */
export async function executeSafeTx(
  wallet: Wallet,
  paymentPayload: EvmSafeWcrcPaymentPayload
): Promise<SettleResult> {
  // Create Safe contract instance with wallet for sending transactions
  const safeContract = new Contract(
    paymentPayload.safeAddress,
    SAFE_ABI,
    wallet
  );

  // Estimate gas for the transaction
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
      paymentPayload.signatures
    );
    
    // Add 20% buffer to gas estimate
    gasEstimate = (gasEstimate * 120n) / 100n;
    
    logger.debug("Gas estimated", { gasEstimate: gasEstimate.toString() });
  } catch (error) {
    logger.error("Gas estimation failed", error);
    return {
      settled: false,
      reason: `Gas estimation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Execute the Safe transaction with proper gas limit
  let tx;
  try {
    tx = await safeContract.execTransaction(
      paymentPayload.safeTx.to,
      paymentPayload.safeTx.value,
      paymentPayload.safeTx.data,
      paymentPayload.safeTx.operation,
      paymentPayload.safeTx.safeTxGas,
      paymentPayload.safeTx.baseGas,
      paymentPayload.safeTx.gasPrice,
      paymentPayload.safeTx.gasToken,
      paymentPayload.safeTx.refundReceiver,
      paymentPayload.signatures,
      {
        gasLimit: gasEstimate,
      }
    );

    logger.info("Transaction sent", { hash: tx.hash });
  } catch (error) {
    logger.error("Transaction execution failed", error);
    return {
      settled: false,
      reason: `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Wait for confirmation
  let receipt;
  try {
    receipt = await tx.wait(1);

    if (!receipt) {
      return { settled: false, reason: "Transaction not confirmed" };
    }

    if (receipt.status === 0) {
      return {
        settled: false,
        reason: "Transaction reverted on-chain",
      };
    }
  } catch (error) {
    logger.error("Transaction confirmation failed", error);
    return {
      settled: false,
      reason: `Confirmation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  logger.info("Transaction execution successful", {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  });

  return {
    settled: true,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber.toString(),
  };
}

