import http from "http";
import { Contract } from "ethers";
import { logger } from "../setup/logger.js";
import { x402Service, type EvmSafeWcrcPaymentPayload } from "../services/x402.js";
import { creditUserBalance } from "../db/user.js";

interface SettleRequest {
  paymentPayload: EvmSafeWcrcPaymentPayload;
}

/**
 * POST /settle
 * Executes the Safe transaction for payment settlement using X402 service
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
 * }
 * 
 * Returns 200 with X-PAYMENT-RESPONSE header
 */

export async function handleSettleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Method not allowed",
        message: "Only POST requests are allowed for /settle",
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
      const data: SettleRequest = JSON.parse(body);
      
      logger.info("Received settle request", {
        safeAddress: data.paymentPayload?.safeAddress,
        receiver: data.paymentPayload?.safeTx.to,
      });

      // Call X402 service to settle payment
      const result = await x402Service.settlePayment(
        data.paymentPayload,
      );

      if (!result.settled) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result, null, 2));
        return;
      }

      // Extract payment amount from transaction data (ERC20 transfer)
      let paymentAmount = 0n;
      try {
        const ERC20_ABI = ["function transfer(address to, uint256 amount) returns (bool)"];
        const iface = new Contract(data.paymentPayload.safeTx.to, ERC20_ABI).interface;
        const decoded = iface.parseTransaction({ data: data.paymentPayload.safeTx.data });
        
        if (decoded && decoded.name === "transfer") {
          paymentAmount = decoded.args[1] as bigint;
          logger.info("Decoded payment amount from transaction", {
            amount: paymentAmount.toString(),
            safeAddress: data.paymentPayload.safeAddress,
          });
        }
      } catch (error) {
        logger.warn("Could not decode payment amount, skipping balance credit", error);
      }

      // Credit user balance in database
      if (paymentAmount > 0n) {
        try {
          await creditUserBalance(data.paymentPayload.safeAddress, paymentAmount);
          logger.info("User balance credited successfully", {
            userAddress: data.paymentPayload.safeAddress,
            amount: paymentAmount.toString(),
          });
        } catch (error) {
          logger.error("Failed to credit user balance", {
            userAddress: data.paymentPayload.safeAddress,
            error,
          });
        }
      }

      // Prepare payment response header
      const paymentResponse = JSON.stringify({
        settled: true,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
      });

      // Return 200 with X-PAYMENT-RESPONSE header
      res.writeHead(200, {
        "Content-Type": "application/json",
        "X-PAYMENT-RESPONSE": paymentResponse,
      });
      
      res.end(JSON.stringify(result, null, 2));
    } catch (error) {
      logger.error("Error settling payment", error);
      
      if (error instanceof SyntaxError) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            settled: false,
            reason: "Invalid JSON",
          })
        );
      } else {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            settled: false,
            reason: error instanceof Error ? error.message : "Execution failed",
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
        settled: false,
        reason: error.message,
      })
    );
  });
}

