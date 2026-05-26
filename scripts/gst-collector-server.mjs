import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

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
  const args = [scriptPath, "--login-only", "--auto-notices"];

  if (gstin) {
    args.push("--expect-gstin", String(gstin).trim().toUpperCase());
  }

  if (rowNumber) {
    args.push("--row", String(rowNumber));
  }

  const outputDir = path.join(process.cwd(), "collector-output");
  fs.mkdirSync(outputDir, { recursive: true });
  const logPath = path.join(outputDir, "gst-helper.log");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  logStream.write(`\n[${new Date().toISOString()}] Starting collector for ${gstin || "Excel row"}\n`);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    child.once("spawn", () => {
      resolve(logPath);
    });

    child.once("error", (error) => {
      logStream.write(`[${new Date().toISOString()}] Collector spawn failed: ${error.message}\n`);
      logStream.end();
      reject(error);
    });

    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
    child.on("exit", (code, signal) => {
      logStream.write(`[${new Date().toISOString()}] Collector exited code=${code} signal=${signal}\n`);
      logStream.end();
    });
  });
}

function findLatestOutput(gstin) {
  const outputDir = path.join(process.cwd(), "collector-output");
  const expectedGstin = String(gstin || "").trim().toUpperCase();
  const files = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir)
      .filter((fileName) => fileName.startsWith("gst-notices-orders-") && fileName.endsWith(".json"))
      .filter((fileName) => !expectedGstin || fileName.includes(expectedGstin))
      .map((fileName) => {
        const filePath = path.join(outputDir, fileName);
        return {
          fileName,
          filePath,
          stats: fs.statSync(filePath),
        };
      })
      .sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs)
    : [];

  const latest = files[0];
  if (!latest) {
    return null;
  }

  return {
    fileName: latest.fileName,
    modifiedAt: latest.stats.mtime.toISOString(),
    payload: JSON.parse(fs.readFileSync(latest.filePath, "utf8")),
  };
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  const requestUrl = new URL(request.url || "/", `http://${HOST}:${PORT}`);

  if (!isAllowedOrigin(origin)) {
    sendJson(response, 403, { error: "Origin is not allowed for the WorkLine GST helper." }, "");
    return;
  }

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {}, origin);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, 200, { status: "ready" }, origin);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/latest") {
    const latest = findLatestOutput(requestUrl.searchParams.get("gstin"));

    if (!latest) {
      sendJson(response, 404, { error: "No GST notices output is available yet." }, origin);
      return;
    }

    sendJson(response, 200, latest, origin);
    return;
  }

  if (request.method !== "POST" || requestUrl.pathname !== "/start") {
    sendJson(response, 404, { error: "Unknown WorkLine GST helper endpoint." }, origin);
    return;
  }

  try {
    const body = await readJson(request);
    const logPath = await startCollector({
      gstin: body.gstin,
      rowNumber: Number.isInteger(body.rowNumber) ? body.rowNumber : null,
    });

    sendJson(
      response,
      200,
      {
        message:
          "GST portal login opened. Enter CAPTCHA in Chrome or Edge; the helper will submit login, open View Notices and Orders, and save the table data.",
        logPath,
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
