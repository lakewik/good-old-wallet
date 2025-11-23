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

    // Validate signatures field
    if (!paymentPayload.signatures) {
      return { valid: false, reason: "Missing signatures field" };
    }

    if (typeof paymentPayload.signatures !== 'string') {
      return { 
        valid: false, 
        reason: `Invalid signatures type: expected string, got ${typeof paymentPayload.signatures}` 
      };
    }

    // Validate signatures is a valid hex string
    const signatures = paymentPayload.signatures;
    if (!signatures.startsWith('0x')) {
      return { 
        valid: false, 
        reason: `Signatures must start with '0x', got: ${signatures.substring(0, 50)}${signatures.length > 50 ? '...' : ''}` 
      };
    }

    if (!/^0x[0-9a-fA-F]+$/.test(signatures)) {
      return { 
        valid: false, 
        reason: `Signatures contains invalid hex characters: ${signatures.substring(0, 50)}${signatures.length > 50 ? '...' : ''}` 
      };
    }

    // Validate signatures length is a multiple of 130 (65 bytes per signature, 2 hex chars per byte)
    if (signatures.length < 132 || (signatures.length - 2) % 130 !== 0) {
      return { 
        valid: false, 
        reason: `Invalid signatures length: expected multiple of 130 hex characters (65 bytes per signature), got ${signatures.length - 2} characters` 
      };
    }

    return { valid: true, reason: "" };
}