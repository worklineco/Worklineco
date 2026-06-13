import http from "node:http";
import https from "node:https";
import process from "node:process";
import { URL } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.WORKLINE_DSC_HELPER_PORT || 48783);
const EMSIGNER_DOWNLOAD_URL = "https://tutorial.gst.gov.in/installers/dscemSigner/GSTSigner-v2.8.msi";
const EMSIGNER_ENDPOINTS = [
  { protocol: "https:", port: 1585 },
  { protocol: "http:", port: 1585 },
  { protocol: "https:", port: 1645 },
  { protocol: "http:", port: 1645 },
  { protocol: "https:", port: 2015 },
  { protocol: "http:", port: 2015 },
  { protocol: "https:", port: 2095 },
  { protocol: "http:", port: 2095 },
  { protocol: "https:", port: 2565 },
  { protocol: "http:", port: 2565 },
];
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

function requestLocalEndpoint({ protocol, port }) {
  return new Promise((resolve) => {
    const client = protocol === "https:" ? https : http;
    const request = client.request(
      {
        host: HOST,
        method: "GET",
        path: "/",
        port,
        rejectUnauthorized: false,
        timeout: 1200,
      },
      (response) => {
        response.resume();
        resolve({ ok: true, port, protocol, statusCode: response.statusCode || 0 });
      },
    );

    request.on("error", () => resolve(null));
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
    request.end();
  });
}

async function detectEmSigner() {
  for (const endpoint of EMSIGNER_ENDPOINTS) {
    const result = await requestLocalEndpoint(endpoint);

    if (result) {
      return result;
    }
  }

  return null;
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
    const emSigner = await detectEmSigner();

    sendJson(
      response,
      200,
      {
        emSigner,
        emSignerDownloadUrl: EMSIGNER_DOWNLOAD_URL,
        engine: emSigner ? "emsigner-detected" : "emsigner-missing",
        helper: "workline-dsc",
        message: emSigner
          ? "WorkLine DSC helper found emSigner on this computer."
          : "WorkLine DSC helper is installed, but emSigner is not running.",
        status: "ready",
      },
      origin,
    );
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/sign") {
    await drainRequest(request);
    const emSigner = await detectEmSigner();

    if (!emSigner) {
      sendJson(
        response,
        409,
        {
          emSignerDownloadUrl: EMSIGNER_DOWNLOAD_URL,
          error: "emSigner is not running on this computer.",
          nextStep: "Install or start emSigner, insert DSC, then click Check again.",
        },
        origin,
      );
      return;
    }

    sendJson(
      response,
      501,
      {
        emSigner,
        error: "emSigner is detected, but WorkLine PDF signing through emSigner is not connected yet.",
        nextStep: "Connect WorkLine helper to the emSigner PDF signing API.",
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
