import { type Address } from "../index.js";
import { isValidAddress } from "../utils/is-valid-address.js";
import { logger } from "../setup/logger.js";
import { getSummarizedAmounts } from "../handlers/summarize-amounts.js";
import http from "http";

/**
 * GET /assets/:address
 * Returns summarized balances across all chains for a given address
 */
export async function handleAssetsRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  address: string
): Promise<void> {
  if (!isValidAddress(address)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Invalid address format",
        message: "Address must be a valid Ethereum address (0x followed by 40 hex characters)",
      })
    );
    return;
  }

  try {
    const summarizedAmounts = await getSummarizedAmounts(address as Address);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(summarizedAmounts, null, 2));
  } catch (error) {
    logger.error("Error getting summarized amounts", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

