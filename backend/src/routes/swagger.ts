import http from "http";
import { logger } from "../setup/logger.js";

let swaggerSpec: any = null;

// Lazy load swagger spec to handle errors gracefully
async function getSwaggerSpec() {
  if (swaggerSpec) {
    return swaggerSpec;
  }

  try {
    const { swaggerSpec: spec } = await import("../setup/swagger.js");
    swaggerSpec = spec;
    return swaggerSpec;
  } catch (error) {
    logger.error("Failed to load swagger spec", error);
    // Return a minimal valid spec if loading fails
    return {
      openapi: "3.0.0",
      info: {
        title: "Abstracted Wallet API",
        version: "1.0.0",
        description: "API documentation is being generated...",
      },
      paths: {},
    };
  }
}

/**
 * Get the base URL from the request (supports ngrok, localhost, etc.)
 * Detects protocol from headers (x-forwarded-proto for proxies like ngrok)
 * or from socket encryption
 */
function getBaseUrl(req: http.IncomingMessage): string {
  const host = req.headers.host || "localhost:7000";
  
  // Check for forwarded protocol (ngrok, reverse proxy, etc.)
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (forwardedProto) {
    // x-forwarded-proto can be a string or array, take first if array
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    return `${proto}://${host}`;
  }
  
  // Check if socket is encrypted (HTTPS)
  const isEncrypted = (req.socket as any).encrypted || 
                      (req.socket as any).getPeerCertificate;
  
  const protocol = isEncrypted ? "https" : "http";
  return `${protocol}://${host}`;
}

/**
 * GET /api-docs
 * Returns the OpenAPI specification in JSON format
 * The spec is dynamically updated with the current request URL
 */
export async function handleApiDocsRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Method not allowed",
        message: "Only GET method is supported",
      })
    );
    return;
  }

  try {
    const spec = await getSwaggerSpec();
    const baseUrl = getBaseUrl(req);
    
    // Update servers array with current URL
    if (spec.servers && spec.servers.length > 0) {
      spec.servers[0].url = baseUrl;
    } else {
      spec.servers = [{ url: baseUrl, description: "Current server" }];
    }
    
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(spec, null, 2));
  } catch (error) {
    logger.error("Error serving API docs", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

/**
 * GET /swagger
 * Returns the Swagger UI HTML page
 */
export async function handleSwaggerUIRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Method not allowed",
        message: "Only GET method is supported",
      })
    );
    return;
  }

  try {
    // Get dynamic base URL from request (supports ngrok, localhost, etc.)
    const baseUrl = getBaseUrl(req);
    const apiDocsUrl = `${baseUrl}/api-docs`;

    // Use CDN for Swagger UI assets
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Abstracted Wallet API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.30.2/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.30.2/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.30.2/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: "${apiDocsUrl}",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (error) {
    logger.error("Error serving Swagger UI", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
