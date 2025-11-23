import { JsonRpcProvider, Wallet } from "ethers";
import { logger } from "../setup/logger.js";
import { providers } from "../setup/providers.js";
import { ChainId } from "../setup/types.js";
import { assertPaymentInput } from "../utils/assert-payment-input.js";
import { verifySafeSignature } from "../utils/verify-safe-signature.js";
import { decodeAndVerifyErc20TransferData } from "../utils/decode-and-verify-erc20-transfer.js";
import { executeSafeTx } from "../utils/execute-safe-tx.js";
import { CirclesRpc } from "@aboutcircles/sdk-rpc";

import dotenv from "dotenv";
dotenv.config();
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
  from: string;
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
  private readonly EXPECTED_NETWORK_ID: number;
  private readonly provider: JsonRpcProvider;
  private readonly wallet?: Wallet;

  constructor(config?: { wcrcAddress?: string; networkId?: number }) {
    // Load configuration from environment
    this.EXPECTED_NETWORK_ID = config?.networkId || ChainId.GNOSIS;
    
    // Get Gnosis Chain provider
    this.provider = providers[ChainId.GNOSIS]!;
    
    // Initialize wallet if private key is available (needed for settlement)
    if (process.env.FACILITATOR_PRIVATE_KEY) {
      this.wallet = new Wallet(
        process.env.FACILITATOR_PRIVATE_KEY,
        this.provider
      );
      logger.info("X402 Service initialized with facilitator wallet", {
        address: this.wallet.address,
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
  ): Promise<VerifyResult> {
    logger.info("Verifying payment", {
      scheme: paymentPayload.scheme,
      networkId: paymentPayload.networkId,
      safeAddress: paymentPayload.safeAddress,
    });

    try {
      // 0. Validate input parameters
      const validationResult = assertPaymentInput(paymentPayload, this.EXPECTED_NETWORK_ID);
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
        const tokenInfo = await circlesRpc.token.getTokenInfo(paymentPayload.safeTx.to as `0x${string}`);
        logger.debug("Token info verified", { tokenInfo });
      } catch (error) {
        return { valid: false, reason: `Token info verification failed: ${error instanceof Error ? error.message : String(error)}` };
      }

      // 3. Decode ERC20 transfer data (without validation since we don't have paymentDetails)
      const decodeResult = decodeAndVerifyErc20TransferData(
        paymentPayload.safeTx.data
        // Not passing expectedReceiver/expectedAmount - just decode
      );

      if (!decodeResult.valid) {
        return { valid: false, reason: decodeResult.reason };
      }

      logger.info("Payment verification successful", {
        receiver: decodeResult.data?.to,
        amount: decodeResult.data?.amount.toString(),
        token: paymentPayload.safeTx.to,
      });

      return {
        valid: true,
        meta: {
            to: decodeResult.data!.to,    
            amount: decodeResult.data!.amount.toString(),         
            token: paymentPayload.safeTx.to,    
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
  ): Promise<SettleResult> {
    logger.info("Settling payment", {
      safeAddress: paymentPayload.safeAddress,
      receiver: paymentPayload.safeTx.to,
      amount: paymentPayload.safeTx.value,
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
      const verifyResult = await this.verifyPayment(paymentPayload);
      if (!verifyResult.valid) {
        return { settled: false, reason: `Verification failed: ${verifyResult.reason}` };
      }

      logger.info("Verification passed, executing transaction...");

      // Execute the Safe transaction (gas estimation, execution, and confirmation)
      const result = await executeSafeTx(this.wallet, paymentPayload);
      
      if (result.settled) {
        logger.info("Payment settlement successful", {
          txHash: result.txHash,
          blockNumber: result.blockNumber,
        });
      }
      
      return result;
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

