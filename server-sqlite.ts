#!/usr/bin/env -S elide run --server
// Elide server with SQLite persistence

import { getCapTable, saveCapTable, initializeSampleData } from "./db.ts";

// Initialize sample data if needed
initializeSampleData();

// Serve static files from public/
const publicDir = new URL("./public/", import.meta.url).pathname;

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // API endpoints
    if (path === "/api/captable") {
      if (request.method === "GET") {
        const capTable = getCapTable();
        if (!capTable) {
          return new Response(JSON.stringify({ error: "No data found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(capTable), {
          headers: { "Content-Type": "application/json" },
        });
      } else if (request.method === "POST") {
        const capTable = await request.json();
        saveCapTable(capTable);
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Serve static files
    let filePath = path === "/" ? "/index.html" : path;
    
    // Remove query params for file lookup
    filePath = filePath.split("?")[0];
    
    const fullPath = publicDir + filePath.slice(1);

    try {
      const file = await Deno.readFile(fullPath);
      const contentType = getContentType(filePath);
      return new Response(file, {
        headers: { "Content-Type": contentType },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  },
};

function getContentType(path: string): string {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "text/plain";
}

