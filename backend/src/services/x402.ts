import { JsonRpcProvider, Wallet, Contract, hexlify, getBytes, Signature, recoverAddress } from "ethers";
import { logger } from "../setup/logger.js";
import { providers } from "../setup/providers.js";
import { ChainId } from "../setup/types.js";
import { decodeAndVerifyErc20TransferData } from "../utils/decode-and-verify-erc20-transfer.js";
import { SAFE_ABI } from "../utils/compute-safe-tx-hash.js";
import { assertPaymentInput } from "../utils/assert-payment-input.js";
import { verifySafeSignature } from "../utils/verify-safe-signature.js";
import { CirclesRpc } from "@aboutcircles/sdk-rpc";

/**
 * X402 Payment Protocol Service
 * Handles verification and settlement of EVM Safe wCRC payments
 * 
 * All logic is inline - no separate classes needed
 */

// ============================================================================
// Types
// ============================================================================

export interface SafeTx {
  to: string;
  value: string;
  data: string;
  operation: number;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
  nonce: string;
}

export interface EvmSafeWcrcPaymentPayload {
  scheme: string;
  networkId: number;
  safeAddress: string;
  safeTx: SafeTx;
  signatures: string;
}

export interface PaymentDetails {
  receiver: string;
  amount: string;
  [key: string]: any;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  meta?: {
    to: string;
    amount: string;
    token: string;
  };
}

export interface SettleResult {
  settled: boolean;
  txHash?: string;
  blockNumber?: string;
  reason?: string;
}

// ============================================================================
// Service Class
// ============================================================================

export class X402Service {
  private readonly WCRC_ADDRESS: string;
  private readonly EXPECTED_NETWORK_ID: number;
  private readonly provider: JsonRpcProvider;
  private readonly wallet?: Wallet;

  constructor(config?: { wcrcAddress?: string; networkId?: number }) {
    // Load configuration from environment
    this.WCRC_ADDRESS = config?.wcrcAddress || process.env.WCRC_ADDRESS || "0x0000000000000000000000000000000000000000";
    this.EXPECTED_NETWORK_ID = config?.networkId || ChainId.GNOSIS;
    
    // Get Gnosis Chain provider
    this.provider = providers[ChainId.GNOSIS];
    
    // Initialize wallet if private key is available (needed for settlement)
    if (process.env.FACILITATOR_PRIVATE_KEY) {
      this.wallet = new Wallet(
        process.env.FACILITATOR_PRIVATE_KEY,
        this.provider
      );
      logger.info("X402 Service initialized with facilitator wallet", {
        address: this.wallet.address,
        wcrcAddress: this.WCRC_ADDRESS,
        networkId: this.EXPECTED_NETWORK_ID,
      });
    } else {
      logger.warn("X402 Service initialized without facilitator wallet - settlement will not work");
    }
  }

  /**
   * Verify payment payload and signatures
   * All logic inline - no need for separate classes
   */
  async verifyPayment(
    paymentPayload: EvmSafeWcrcPaymentPayload,
    paymentDetails: PaymentDetails
  ): Promise<VerifyResult> {
    logger.info("Verifying payment", {
      scheme: paymentPayload.scheme,
      networkId: paymentPayload.networkId,
      safeAddress: paymentPayload.safeAddress,
    });

    try {
      // 0. Validate input parameters
      const validationResult = assertPaymentInput(paymentPayload, paymentDetails, this.EXPECTED_NETWORK_ID);
      if (!validationResult.valid) {
        return { valid: false, reason: validationResult.reason };
      }

      // 1. Verify Safe signatures
      const signatureVerificationResult = await verifySafeSignature(paymentPayload, this.provider);
      if (!signatureVerificationResult.valid) {
        return { valid: false, reason: signatureVerificationResult.reason };
      }

      logger.info("Safe signatures verified", {
        signers: signatureVerificationResult.data?.recoveredSigners,
        threshold: signatureVerificationResult.data?.threshold,
      });

      // 2. Validate token contract (must be wCRC)

      try {
        const circlesRpc = new CirclesRpc('https://rpc.aboutcircles.com/');
        const tokenInfo = await circlesRpc.token.getTokenInfo(this.WCRC_ADDRESS as `0x${string}`);
        logger.debug("Token info verified", { tokenInfo });
      } catch (error) {
        return { valid: false, reason: `Token info verification failed: ${error instanceof Error ? error.message : String(error)}` };
      }

      // 3. Decode and validate ERC20 transfer data
      const decodeResult = decodeAndVerifyErc20TransferData(
        paymentPayload.safeTx.data,
        paymentDetails.receiver,
        paymentDetails.amount
      );

      if (!decodeResult.valid) {
        return { valid: false, reason: decodeResult.reason };
      }

      logger.info("Payment verification successful", {
        receiver: decodeResult.data?.to,
        amount: decodeResult.data?.amount.toString(),
        token: this.WCRC_ADDRESS,
      });

      return {
        valid: true,
        meta: {
          to: decodeResult.data!.to,
          amount: decodeResult.data!.amount.toString(),
          token: this.WCRC_ADDRESS,
        },
      };
    } catch (error) {
      logger.error("Error verifying payment", error);
      return {
        valid: false,
        reason: error instanceof Error ? error.message : "Internal error",
      };
    }
  }

  /**
   * Execute Safe transaction for payment settlement
   * All logic inline - no need for separate classes
   */
  async settlePayment(
    paymentPayload: EvmSafeWcrcPaymentPayload,
    paymentDetails: PaymentDetails
  ): Promise<SettleResult> {
    logger.info("Settling payment", {
      safeAddress: paymentPayload.safeAddress,
      receiver: paymentDetails.receiver,
      amount: paymentDetails.amount,
    });

    try {
      // Check if wallet is available
      if (!this.wallet) {
        return {
          settled: false,
          reason: "Facilitator wallet not configured - set FACILITATOR_PRIVATE_KEY in .env",
        };
      }

      // Re-verify before settlement (security best practice)
      const verifyResult = await this.verifyPayment(paymentPayload, paymentDetails);
      if (!verifyResult.valid) {
        return { settled: false, reason: `Verification failed: ${verifyResult.reason}` };
      }

      logger.info("Verification passed, executing transaction...");

      // Create Safe contract instance with wallet for sending transactions
      const safeContract = new Contract(
        paymentPayload.safeAddress,
        SAFE_ABI,
        this.wallet
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

      logger.info("Payment settlement successful", {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return {
        settled: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber.toString(),
      };
    } catch (error) {
      logger.error("Error settling payment", error);
      return {
        settled: false,
        reason: error instanceof Error ? error.message : "Execution failed",
      };
    }
  }

  //TODO: refactor this to cleanups just like the verify is done
}

// ============================================================================
// Singleton Instance
// ============================================================================

// Export a default instance
export const x402Service = new X402Service();

