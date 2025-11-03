/**
 * Elide HTTP Server for Cap Table Visualizer
 * 
 * This is the primary server implementation using Elide's native HTTP serving.
 * Falls back to server-node.js when elide serve has issues (beta10).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function getMimeType(path: string): string {
  const ext = path.substring(path.lastIndexOf("."));
  return MIME_TYPES[ext] || "application/octet-stream";
}

function serveStaticFile(path: string): Response {
  try {
    const filePath = join(process.cwd(), "public", path);
    const content = readFileSync(filePath);
    const mimeType = getMimeType(path);

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return new Response("Not Found", { status: 404 });
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    console.log(`[Elide] ${request.method} ${path}`);

    // Serve index.html for root
    if (path === "/") {
      return serveStaticFile("index.html");
    }

    // Serve static files
    if (path.startsWith("/")) {
      return serveStaticFile(path.substring(1));
    }

    return new Response("Not Found", { status: 404 });
  },
};

