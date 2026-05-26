import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const HOST = "127.0.0.1";
const PORT = Number(process.env.WORKLINE_GST_HELPER_PORT || 48782);
const ALLOWED_ORIGINS = new Set([
  "https://worklineco.com",
  "https://www.worklineco.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON request body."));
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, status, payload, origin) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Allow-Origin": origin || "null",
    "Content-Type": "application/json",
    "Vary": "Origin",
  });
  response.end(JSON.stringify(payload));
}

function isAllowedOrigin(origin) {
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function startCollector({ gstin, rowNumber }) {
  const scriptPath = path.join(process.cwd(), "scripts", "gst-portal-collector.mjs");
  const args = [scriptPath, "--login-only", "--row", String(rowNumber || 2)];

  if (gstin) {
    args.push("--expect-gstin", String(gstin).trim().toUpperCase());
  }

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });

  child.unref();
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";

  if (!isAllowedOrigin(origin)) {
    sendJson(response, 403, { error: "Origin is not allowed for the WorkLine GST helper." }, "");
    return;
  }

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {}, origin);
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { status: "ready" }, origin);
    return;
  }

  if (request.method !== "POST" || request.url !== "/start") {
    sendJson(response, 404, { error: "Unknown WorkLine GST helper endpoint." }, origin);
    return;
  }

  try {
    const body = await readJson(request);
    startCollector({
      gstin: body.gstin,
      rowNumber: Number.isInteger(body.rowNumber) ? body.rowNumber : 2,
    });

    sendJson(
      response,
      200,
      {
        message:
          "GST portal collector started. Chrome or Edge should open and continue with the selected GSTIN.",
      },
      origin,
    );
  } catch (error) {
    sendJson(response, 400, { error: error.message }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`WorkLine GST helper listening on http://${HOST}:${PORT}`);
  console.log("Keep this window open while using Get data on worklineco.com/gst.");
});
