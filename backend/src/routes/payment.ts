import type { IncomingMessage, ServerResponse } from "http";
import { logger } from "../setup/logger.js";

/**
 * Handle GET /payment endpoint
 * Returns 402 Payment Required status
 */
export function handlePaymentRequest(
  req: IncomingMessage,
  res: ServerResponse
): void {
  logger.info("Payment endpoint called");

  res.statusCode = 402;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      error: "Payment Required",
      message: "402 Payment Required",
    })
  );
}

