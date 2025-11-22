import { Interface } from "ethers";
import { logger } from "../setup/logger.js";

// Minimal ERC20 ABI for transfer function
export const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
];

/**
 * Result of ERC20 transfer data decoding and verification
 */
export interface DecodeTransferResult {
  valid: boolean;
  reason?: string;
  data?: {
    functionName: string;
    to: string;
    amount: bigint;
  };
}

/**
 * Decode and verify ERC20 transfer function call data
 * Returns a result object with validation status and decoded data
 * 
 * If expectedReceiver and expectedAmount are provided, validates them.
 * If not provided, just decodes without validation.
 */
export function decodeAndVerifyErc20TransferData(
  data: string,
  expectedReceiver?: string,
  expectedAmount?: string
): DecodeTransferResult {
  try {
    const iface = new Interface(ERC20_ABI);
    const decoded = iface.parseTransaction({ data });

    // Check if it's a transfer function
    if (!decoded || decoded.name !== "transfer") {
      return { valid: false, reason: "Not a transfer function call" };
    }

    const to: string = decoded.args[0];
    const amount: bigint = decoded.args[1];

    // Validate receiver matches expected (if provided)
    if (expectedReceiver && to.toLowerCase() !== expectedReceiver.toLowerCase()) {
      return {
        valid: false,
        reason: `Wrong receiver: expected ${expectedReceiver}, got ${to}`,
      };
    }

    // Validate amount matches expected (if provided)
    if (expectedAmount && amount.toString() !== expectedAmount) {
      return {
        valid: false,
        reason: `Wrong amount: expected ${expectedAmount}, got ${amount.toString()}`,
      };
    }

    logger.debug("ERC20 transfer data decoded and verified", {
      to,
      amount: amount.toString(),
    });

    // All validations passed
    return {
      valid: true,
      data: {
        functionName: decoded.name,
        to,
        amount,
      },
    };
  } catch (error) {
    logger.error("Error decoding ERC20 transfer data", error);
    return {
      valid: false,
      reason: `Failed to decode transfer data: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
  