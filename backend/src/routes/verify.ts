import http from "http";
import { logger } from "../setup/logger.js";
import { x402Service, type EvmSafeWcrcPaymentPayload, type PaymentDetails } from "../services/x402.js";

interface VerifyRequest {
  paymentPayload: EvmSafeWcrcPaymentPayload;
  paymentDetails: PaymentDetails;
}

/**
 * POST /verify
 * Verifies payment payload and signature using X402 service
 * 
 * Expected request body:
 * {
 *   "paymentPayload": {
 *     "scheme": "evm-safe-wcrc",
 *     "networkId": 100,
 *     "safeAddress": "0x...",
 *     "safeTx": { ... },
 *     "signatures": "0x..."
 *   },
 *   "paymentDetails": {
 *     "receiver": "0x...",
 *     "amount": "1000000"
 *   }
 * }
 */
export async function handleVerifyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Method not allowed",
        message: "Only POST requests are allowed for /verify",
      })
    );
    return;
  }

  let body = "";
  
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", async () => {
    try {
      const data: VerifyRequest = JSON.parse(body);
      
      logger.info("Received verify request", {
        scheme: data.paymentPayload?.scheme,
        networkId: data.paymentPayload?.networkId,
      });

      // Call X402 service to verify payment
      const result = await x402Service.verifyPayment(
        data.paymentPayload,
        data.paymentDetails
      );

      const statusCode = result.valid ? 200 : 400;
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result, null, 2));
    } catch (error) {
      logger.error("Error verifying payment", error);
      
      if (error instanceof SyntaxError) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            valid: false,
            reason: "Invalid JSON",
          })
        );
      } else {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            valid: false,
            reason: error instanceof Error ? error.message : "Internal error",
          })
        );
      }
    }
  });

  req.on("error", (error) => {
    logger.error("Request error", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        valid: false,
        reason: error.message,
      })
    );
  });
}

