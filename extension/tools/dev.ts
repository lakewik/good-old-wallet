import { watch } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { srcDir, publicDir, bundleFile } from "./utils";

const PORT = parseInt(process.env.PORT || "3000");
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// Path to popup.html
const popupHtmlPath = join(projectRoot, "public", "popup.html");

// Inject HMR client script
const hmrClientScript = `
<script>
  (function() {
    const ws = new WebSocket('ws://localhost:${PORT}/__hmr');
    ws.onmessage = (event) => {
      if (event.data === 'reload') {
        console.log('🔄 Reloading...');
        window.location.reload();
      }
    };
    ws.onerror = () => {
      console.warn('HMR WebSocket connection failed');
    };
    ws.onclose = () => {
      console.log('HMR WebSocket closed');
    };
  })();
</script>`;

// Function to read and modify HTML for dev mode (reads fresh on each request)
async function getDevHtml(): Promise<string> {
  const popupHtmlContent = await Bun.file(popupHtmlPath).text();

  // Modify HTML for dev mode:
  // 1. Add dev-mode class to body
  // 2. Change script src to TSX file
  // 3. Inject HMR script
  return popupHtmlContent
    .replace("<body>", '<body class="dev-mode">')
    .replace('src="popup.js"', 'src="./src/popup.tsx"')
    .replace("</body>", `${hmrClientScript}</body>`);
}

// Store connected WebSocket clients
const connectedClients = new Set<any>();

let server;
try {
  server = Bun.serve({
    port: PORT,
    websocket: {
      message() {
        // Handle WebSocket messages if needed
      },
      open(ws) {
        connectedClients.add(ws);
        console.log("🔌 HMR client connected");
      },
      close(ws) {
        connectedClients.delete(ws);
        console.log("🔌 HMR client disconnected");
      },
    },
    async fetch(req, server) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // WebSocket upgrade for HMR
      if (pathname === "/__hmr") {
        if (server.upgrade(req)) {
          return;
        }
        return new Response("Upgrade failed", { status: 500 });
      }

      // Serve HTML with HMR injected (read fresh on each request)
      if (pathname === "/") {
        const devHtml = await getDevHtml();
        return new Response(devHtml, {
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "no-cache",
          },
        });
      }

      // Handle TypeScript/TSX files - bundle them on the fly
      if (
        pathname.endsWith(".ts") ||
        pathname.endsWith(".tsx") ||
        pathname.endsWith(".jsx")
      ) {
        const filePath = join(projectRoot, pathname);
        try {
          const output = await bundleFile(filePath, {
            minify: false,
            sourcemap: "inline",
          });
          const code = await output.text();

          return new Response(code, {
            headers: {
              "Content-Type": "application/javascript",
              "Cache-Control": "no-cache",
            },
          });
        } catch (error: any) {
          return new Response(`Error bundling file: ${error.message}`, {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          });
        }
      }

      // Try to serve static files from public directory
      try {
        // First try public directory (for CSS, images, etc.)
        const publicFile = Bun.file(join(projectRoot, "public", pathname));
        if (await publicFile.exists()) {
          const contentType = pathname.endsWith(".css")
            ? "text/css"
            : pathname.endsWith(".json")
              ? "application/json"
              : undefined;
          return new Response(publicFile, {
            headers: contentType ? { "Content-Type": contentType } : undefined,
          });
        }
        // Fallback to project root
        const file = Bun.file(join(projectRoot, pathname));
        if (await file.exists()) {
          return new Response(file);
        }
      } catch {
        // File doesn't exist
      }

      return new Response("Not found", { status: 404 });
    },
  });

  // Helper function to trigger reload
  function triggerReload(filename: string) {
    console.log(`📝 File changed: ${filename}, reloading...`);
    connectedClients.forEach((client) => {
      try {
        client.send("reload");
      } catch (error) {
        // Client might be closed, remove it
        connectedClients.delete(client);
      }
    });
  }

  // File watching for hot reload - watch src/ for TS/TSX changes
  console.log("👀 Watching for file changes in src/...");
  watch(srcDir, { recursive: true }, (eventType, filename) => {
    if (filename && (filename.endsWith(".ts") || filename.endsWith(".tsx"))) {
      triggerReload(filename);
    }
  });

  // File watching for hot reload - watch public/ for HTML, CSS, JSON, etc.
  console.log("👀 Watching for file changes in public/...");
  watch(publicDir, { recursive: true }, (eventType, filename) => {
    if (filename) {
      triggerReload(filename);
    }
  });
} catch (error: any) {
  if (error.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.log(`💡 Try: PORT=3001 bun run dev:server`);
    console.log(
      `💡 Or kill the process using port ${PORT}: lsof -ti:${PORT} | xargs kill -9`
    );
    process.exit(1);
  }
  throw error;
}

const serverUrl = `http://localhost:${server.port}`;
console.log(`🚀 Dev server running at ${serverUrl}`);
console.log(`📱 Popup dimensions: 400x500px`);
console.log(`\n💡 Open ${serverUrl} in your browser for hot reloading!`);
