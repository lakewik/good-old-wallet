import { EvmSafeWcrcPaymentPayload } from "../services/x402";

export function assertPaymentInput(paymentPayload: EvmSafeWcrcPaymentPayload, expectedNetworkId: number): { valid: boolean, reason: string } {
    if (!paymentPayload) {
      return { valid: false, reason: "Missing payment payload" };
    }

    if (!paymentPayload.safeAddress || !paymentPayload.safeTx) {
      return { valid: false, reason: "Invalid payment payload structure" };
    }

    if (!paymentPayload.safeTx.to || !paymentPayload.safeTx.value || !paymentPayload.safeTx.from) {
      return { valid: false, reason: "Invalid safe transaction structure" };
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