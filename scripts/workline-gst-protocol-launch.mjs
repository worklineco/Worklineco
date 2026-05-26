import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { getWorklineGstHome } from "./gst-helper-home.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.WORKLINE_GST_HELPER_PORT || 48782);

function parseProtocolUrl(rawUrl) {
  const normalized = String(rawUrl || "").trim();
  const withoutScheme = normalized.replace(/^workline-gst:\/\//i, "");
  const queryIndex = withoutScheme.indexOf("?");
  const query = queryIndex >= 0 ? withoutScheme.slice(queryIndex + 1) : withoutScheme.includes("=") ? withoutScheme : "";
  const params = new URLSearchParams(query);
  return {
    gstin: (params.get("gstin") || "").trim().toUpperCase(),
  };
}

function requestJson(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const request = http.request(
      {
        host: HOST,
        port: PORT,
        path: pathname,
        method,
        headers: body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }
          : undefined,
      },
      (response) => {
        let text = "";
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          resolve({ status: response.statusCode || 0, text });
        });
      },
    );

    request.on("error", reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

async function isHelperReady() {
  try {
    const result = await requestJson("GET", "/health");
    return result.status === 200;
  } catch {
    return false;
  }
}

function startHelperServer(home) {
  const serverScript = path.join(home, "scripts", "gst-collector-server.mjs");
  const child = spawn(process.execPath, [serverScript], {
    cwd: home,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      WORKLINE_GST_HOME: home,
    },
  });
  child.unref();
}

async function ensureHelperRunning(home) {
  if (await isHelperReady()) {
    return;
  }

  startHelperServer(home);
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (await isHelperReady()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("WorkLine GST helper did not start on this computer.");
}

async function main() {
  const home = getWorklineGstHome();
  const { gstin } = parseProtocolUrl(process.argv[2] || "");

  await ensureHelperRunning(home);

  if (gstin) {
    await requestJson("POST", "/start", { gstin });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
