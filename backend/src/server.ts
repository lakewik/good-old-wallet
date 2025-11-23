import "./setup/config.js"; // Load environment variables
import http from "http";
import url from "url";
import { logger } from "./setup/logger.js";
import { handleAssetsRequest, handleVerifyRequest, handleSettleRequest, handleBalancesSummaryRequest, handlePlanSendingTransactionRequest, handleApiDocsRequest, handleSwaggerUIRequest, handleTransactionsRequest, handleLatestCIDRequest, handlePaymentRequest, handleCounterRequest, handleCounterStatusRequest, handleUserRequest } from "./routes/index.js";
import { connectToMongoDB, closeMongoDB } from "./setup/mongodb.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7001;

// Initialize MongoDB connection
connectToMongoDB().catch((error) => {
  logger.error("Failed to connect to MongoDB on startup", error);
  console.error("⚠️  Warning: MongoDB connection failed. Some features may not work.");
});

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, ngrok-skip-browser-warning");

  // Handle OPTIONS request
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url || "", true);
  const pathname = parsedUrl.pathname;

  logger.info("Incoming request", {
    method: req.method,
    pathname,
  });

  // Health check endpoint
  if (pathname === "/health" || pathname === "/") {
    /**
     * @swagger
     * /health:
     *   get:
     *     summary: Health check
     *     description: Returns the health status of the API
     *     tags: [Health]
     *     responses:
     *       200:
     *         description: Service is healthy
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status:
     *                   type: string
     *                   example: "ok"
     *                 service:
     *                   type: string
     *                   example: "abstracted-wallet-api"
     *                 timestamp:
     *                   type: string
     *                   format: date-time
     */
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "abstracted-wallet-api",
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  // Swagger UI endpoint
  if (pathname === "/swagger" || pathname === "/swagger/" || pathname === "/api-docs/ui") {
    logger.info("Serving Swagger UI", { pathname });
    try {
      await handleSwaggerUIRequest(req, res);
    } catch (error) {
      logger.error("Error in Swagger UI handler", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Internal server error",
            message: error instanceof Error ? error.message : String(error),
          })
        );
      }
    }
    return;
  }

  // OpenAPI JSON specification endpoint
  if (pathname === "/api-docs" || pathname === "/api-docs/" || pathname === "/swagger.json") {
    logger.info("Serving API docs", { pathname });
    try {
      await handleApiDocsRequest(req, res);
    } catch (error) {
      logger.error("Error in API docs handler", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Internal server error",
            message: error instanceof Error ? error.message : String(error),
          })
        );
      }
    }
    return;
  }

  // Assets endpoint (renamed from get-summarized-amounts)
  const assetsMatch = pathname?.match(/^\/assets\/(.+)$/);
  if (assetsMatch && req.method === "GET") {
    const address = assetsMatch[1] as string;
    await handleAssetsRequest(req, res, address);
    return;
  }

  // Balances Summary endpoint
  const balancesSummaryMatch = pathname?.match(/^\/balancesSummary\/(.+)$/);
  if (balancesSummaryMatch && req.method === "GET") {
    const address = balancesSummaryMatch[1] as string;
    await handleBalancesSummaryRequest(req, res, address);
    return;
  }

  // Transactions endpoint
  const transactionsMatch = pathname?.match(/^\/transactions\/(.+)$/);
  if (transactionsMatch && req.method === "GET") {
    const address = transactionsMatch[1] as string;
    await handleTransactionsRequest(req, res, address);
    return;
  }

  // Latest CID endpoint
  const latestCidMatch = pathname?.match(/^\/latest-cid\/(.+)$/);
  if (latestCidMatch && req.method === "GET") {
    const address = latestCidMatch[1] as string;
    await handleLatestCIDRequest(req, res, address);
    return;
  }

  // Verify endpoint
  if (pathname === "/verify") {
    await handleVerifyRequest(req, res);
    return;
  }

  // Settle endpoint
  if (pathname === "/settle") {
    await handleSettleRequest(req, res);
    return;
  }

  // Plan sending transaction endpoint
  if (pathname === "/plan-sending-transaction") {
    await handlePlanSendingTransactionRequest(req, res);
    return;
  }

  // Payment endpoint (returns 402)
  if (pathname === "/payment" && req.method === "GET") {
    handlePaymentRequest(req, res);
    return;
  }

  // Counter endpoint
  if (pathname === "/counter" && req.method === "POST") {
    await handleCounterRequest(req, res);
    return;
  }

  // Counter status endpoint
  const counterStatusMatch = pathname?.match(/^\/counter-status\/(.+)$/);
  if (counterStatusMatch && req.method === "GET") {
    const address = counterStatusMatch[1] as string;
    await handleCounterStatusRequest(req, res, address);
    return;
  }

  // User endpoint
  if (pathname === "/user" && req.method === "POST") {
    await handleUserRequest(req, res);
    return;
  }

  // 404 for all other routes
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Not found",
      message: `Route ${pathname} not found`,
      availableRoutes: [
        "GET /health",
        "GET /assets/:address",
        "GET /balancesSummary/:address",
        "GET /transactions/:address",
        "GET /latest-cid/:address",
        "POST /verify",
        "POST /settle",
        "POST /plan-sending-transaction",
        "GET /payment",
        "POST /counter",
        "GET /counter-status/:address",
        "POST /user",
        "GET /swagger",
        "GET /api-docs",
      ],
    }),
  );
});

// Increase max listeners to avoid warnings when using hot reload (tsx watch)
server.setMaxListeners(50);
process.setMaxListeners(50);

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    logger.error("Port already in use", {
      port: PORT,
      message: `Port ${PORT} is already in use. Please use a different port by setting PORT environment variable.`,
    });
    console.error(`❌ Error: Port ${PORT} is already in use.`);
    console.error(`   Try using a different port: PORT=7002 npm run dev:server`);
    console.error(`   Or kill the process using port ${PORT}: lsof -ti:${PORT} | xargs kill`);
    console.error(`   Check what's using the port: lsof -i :${PORT}`);
    process.exit(1);
  } else {
    logger.error("Server error", error);
    console.error("❌ Server error:", error.message);
    process.exit(1);
  }
});

server.listen(PORT, "localhost", () => {
  logger.info("Server started", {
    host: "localhost",
    port: PORT,
    endpoints: [
      "GET /health",
      "GET /assets/:address",
      "GET /balancesSummary/:address",
      "GET /transactions/:address",
      "GET /latest-cid/:address",
      "POST /verify",
      "POST /settle",
      "POST /plan-sending-transaction",
      "GET /payment",
      "POST /counter",
      "GET /counter-status/:address",
      "POST /user",
      "GET /swagger",
      "GET /api-docs",
    ],
  });
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`💰 Assets: http://localhost:${PORT}/assets/:address`);
  console.log(`📈 Balances Summary: http://localhost:${PORT}/balancesSummary/:address`);
  console.log(`✅ Verify: http://localhost:${PORT}/verify`);
  console.log(`🔒 Settle: http://localhost:${PORT}/settle`);
  console.log(`📋 Plan Sending Transaction: http://localhost:${PORT}/plan-sending-transaction`);
  console.log(`💳 Payment (402): http://localhost:${PORT}/payment`);
  console.log(`🔢 Counter: http://localhost:${PORT}/counter`);
  console.log(`📊 Counter Status: http://localhost:${PORT}/counter-status/:address`);
  console.log(`👤 User (Get/Create): http://localhost:${PORT}/user`);
  console.log(`📚 Swagger UI: http://localhost:${PORT}/swagger`);
  console.log(`📖 API Docs (JSON): http://localhost:${PORT}/api-docs`);
});

// Graceful shutdown - use once() to prevent multiple listeners from being added
let isShuttingDown = false;

function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    logger.debug(`Already shutting down, ignoring ${signal}`);
    return;
  }
  isShuttingDown = true;

  logger.info(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    await closeMongoDB();
    logger.info("Server closed");
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown doesn't complete
  setTimeout(() => {
    logger.warn("Forcing exit after timeout");
    process.exit(1);
  }, 10000);
}

process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.once("SIGINT", () => gracefulShutdown("SIGINT"));
