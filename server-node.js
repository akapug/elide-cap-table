/**
 * Node.js HTTP Server for Cap Table Visualizer
 * 
 * This is a fallback server for when Elide's HTTP serving is broken (beta10).
 * Implements the same logic as server.ts but using Node.js http module.
 */

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 8080;

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function getMimeType(path) {
  const ext = path.substring(path.lastIndexOf("."));
  return MIME_TYPES[ext] || "application/octet-stream";
}

function serveStaticFile(res, path) {
  try {
    const filePath = join(__dirname, "public", path);
    
    if (!existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    const content = readFileSync(filePath);
    const mimeType = getMimeType(path);

    res.writeHead(200, {
      "Content-Type": mimeType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });
    res.end(content);
  } catch (error) {
    console.error("Error serving file:", error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  console.log(`[Node.js] ${req.method} ${path}`);

  // Serve index.html for root
  if (path === "/") {
    serveStaticFile(res, "index.html");
    return;
  }

  // Serve static files
  if (path.startsWith("/")) {
    serveStaticFile(res, path.substring(1));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`\n🚀 Cap Table Visualizer running on http://localhost:${PORT}`);
  console.log(`📊 Open your browser to view the interactive treemap\n`);
  console.log(`Running on: Node.js (Elide fallback)`);
  console.log(`Note: This uses Node.js because elide serve is broken in beta10\n`);
});

