import http from "http";
import url from "url";
import { logger } from "../setup/logger.js";
import { incrementCounter, getUserCounter, getCounterCost } from "../services/counter.js";
import { getUserBalance } from "../db/user.js";

interface CounterRequest {
  userAddress: string;
}

/**
 * POST /counter
 * Increment user counter and deduct balance
 * 
 * Expected request body:
 * {
 *   "userAddress": "0x..."
 * }
 */
export async function handleCounterRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: false,
        error: "Method not allowed",
        message: "Only POST requests are allowed for /counter",
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
      const data: CounterRequest = JSON.parse(body);
      
      if (!data.userAddress) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "invalid_request",
            message: "userAddress is required",
          })
        );
        return;
      }
      
      logger.info("Counter request received", {
        userAddress: data.userAddress,
      });

      // Increment counter (includes balance check and deduction)
      const result = await incrementCounter(data.userAddress);

      if (!result.success) {
        // Out of funds or other error
        res.writeHead(402, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            counter: null,
            balance: result.balance || null,
            error: result.error,
            message: result.message,
          })
        );
        return;
      }

      // Success
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          counter: result.counter,
          balance: result.balance,
          message: result.message,
        })
      );
    } catch (error) {
      logger.error("Error handling counter request", error);
      
      if (error instanceof SyntaxError) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "invalid_json",
            message: "Invalid JSON",
          })
        );
      } else {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: "server_error",
            message: error instanceof Error ? error.message : "Internal server error",
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
        success: false,
        error: "request_error",
        message: error.message,
      })
    );
  });
}

/**
 * GET /counter-status/:address
 * Get user counter and balance status
 */
export async function handleCounterStatusRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  userAddress: string
): Promise<void> {
  try {
    logger.info("Counter status request", { userAddress });

    const [counter, balance] = await Promise.all([
      getUserCounter(userAddress),
      getUserBalance(userAddress),
    ]);

    const counterCost = getCounterCost();
    const currentBalance = balance ? BigInt(balance.balance) : 0n;
    const canAfford = currentBalance >= counterCost;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        counter: counter?.count || 0,
        balance: balance?.balance || "0",
        counterCost: counterCost.toString(),
        canAfford,
      })
    );
  } catch (error) {
    logger.error("Error fetching counter status", { userAddress, error });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: false,
        error: "server_error",
        message: error instanceof Error ? error.message : "Internal server error",
      })
    );
  }
}

