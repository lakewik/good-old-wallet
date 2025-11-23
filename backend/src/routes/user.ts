import http from "http";
import { logger } from "../setup/logger.js";
import { getOrCreateUser } from "../db/user.js";

interface UserRequest {
  userAddress: string;
}

/**
 * POST /user
 * Get or create user in database
 * 
 * Expected request body:
 * {
 *   "userAddress": "0x..."
 * }
 * 
 * Returns:
 * {
 *   "success": true,
 *   "exists": boolean,     // true if user already existed
 *   "user": {
 *     "userAddress": "0x...",
 *     "balance": "0",
 *     "createdAt": "...",
 *     "updatedAt": "..."
 *   }
 * }
 */
export async function handleUserRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: false,
        error: "Method not allowed",
        message: "Only POST requests are allowed for /user",
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
      const data: UserRequest = JSON.parse(body);
      
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
      
      logger.info("User request received", {
        userAddress: data.userAddress,
      });

      // Business logic: Get or create user
      const result = await getOrCreateUser(data.userAddress);

      logger.info(
        result.exists ? "Existing user loaded" : "New user created",
        {
          userAddress: data.userAddress,
          balance: result.user.balance,
        }
      );

      // Success
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          exists: result.exists,
          user: {
            userAddress: result.user.userAddress,
            balance: result.user.balance,
            createdAt: result.user.createdAt,
            updatedAt: result.user.updatedAt,
          },
          message: result.exists 
            ? "User already exists" 
            : "New user created successfully",
        })
      );
    } catch (error) {
      logger.error("Error handling user request", error);
      
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
