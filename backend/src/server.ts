import "./setup/config.js"; // Load environment variables
import http from "http";
import url from "url";
import { logger } from "./setup/logger.js";
import { handleAssetsRequest, handleVerifyRequest, handleSettleRequest } from "./routes/index.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7000;

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

  // Assets endpoint (renamed from get-summarized-amounts)
  const assetsMatch = pathname?.match(/^\/assets\/(.+)$/);
  if (assetsMatch && req.method === "GET") {
    const address = assetsMatch[1] as string;
    await handleAssetsRequest(req, res, address);
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

  // 404 for all other routes
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: "Not found",
      message: `Route ${pathname} not found`,
      availableRoutes: [
        "GET /health",
        "GET /assets/:address",
        "POST /verify",
        "POST /settle",
      ],
    }),
  );
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    logger.error("Port already in use", {
      port: PORT,
      message: `Port ${PORT} is already in use. Please use a different port by setting PORT environment variable.`,
    });
    console.error(`❌ Error: Port ${PORT} is already in use.`);
    console.error(`   Try using a different port: PORT=3001 npm run dev:server`);
    console.error(`   Or kill the process using port ${PORT}: lsof -ti:${PORT} | xargs kill`);
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
      "POST /verify",
      "POST /settle",
    ],
  });
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`💰 Assets: http://localhost:${PORT}/assets/:address`);
  console.log(`✅ Verify: http://localhost:${PORT}/verify`);
  console.log(`🔒 Settle: http://localhost:${PORT}/settle`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});
