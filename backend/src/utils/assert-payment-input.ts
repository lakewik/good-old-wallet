import { EvmSafeWcrcPaymentPayload, PaymentDetails } from "../services/x402";

export function assertPaymentInput(paymentPayload: EvmSafeWcrcPaymentPayload, paymentDetails: PaymentDetails, expectedNetworkId: number): { valid: boolean, reason: string } {
    if (!paymentPayload || !paymentDetails) {
      return { valid: false, reason: "Missing payment payload or details" };
    }

    if (!paymentPayload.safeAddress || !paymentPayload.safeTx) {
      return { valid: false, reason: "Invalid payment payload structure" };
    }

    if (!paymentDetails.receiver || !paymentDetails.amount) {
      return { valid: false, reason: "Invalid payment details structure" };
    }

    if (paymentPayload.scheme !== "evm-safe-wcrc") {
      return { valid: false, reason: "Unknown scheme" };
    }

    if (paymentPayload.networkId !== expectedNetworkId) {
    return {
        valid: false,
        reason: `Wrong network: expected ${expectedNetworkId}, got ${paymentPayload.networkId}`,
      };
    }

    return { valid: true, reason: "" };
}