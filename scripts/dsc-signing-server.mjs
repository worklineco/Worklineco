import http from "node:http";
import process from "node:process";
import { URL } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.WORKLINE_DSC_HELPER_PORT || 48783);
const ALLOWED_ORIGINS = new Set([
  "https://worklineco.com",
  "https://www.worklineco.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3003",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3003",
]);

function isAllowedOrigin(origin) {
  return !origin || ALLOWED_ORIGINS.has(origin);
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

function drainRequest(request) {
  return new Promise((resolve, reject) => {
    request.on("data", () => {});
    request.on("end", resolve);
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  const requestUrl = new URL(request.url || "/", `http://${HOST}:${PORT}`);

  if (!isAllowedOrigin(origin)) {
    sendJson(response, 403, { error: "Origin is not allowed for the WorkLine DSC helper." }, "");
    return;
  }

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {}, origin);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(
      response,
      200,
      {
        engine: "pending",
        helper: "workline-dsc",
        message: "WorkLine DSC helper is reachable. DSC token signing engine is not connected yet.",
        status: "ready",
      },
      origin,
    );
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/sign") {
    await drainRequest(request);
    sendJson(
      response,
      501,
      {
        error: "DSC token signing engine is not connected yet.",
        nextStep: "Connect the Windows DSC/token signing layer in this local helper.",
      },
      origin,
    );
    return;
  }

  sendJson(response, 404, { error: "Unknown WorkLine DSC helper endpoint." }, origin);
});

server.listen(PORT, HOST, () => {
  console.log(`WorkLine DSC helper listening on http://${HOST}:${PORT}`);
  console.log("Keep this window open while using DSC filing on worklineco.com/pdf-indexing.");
});
