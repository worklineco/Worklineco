import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.WORKLINE_DSC_HELPER_PORT || 48783);
const HELPER_VERSION = "v11";
const EMSIGNER_DOWNLOAD_URL = "https://tutorial.gst.gov.in/installers/dscemSigner/GSTSigner-v2.8.msi";
const NIC_SIGNER_URL = "https://127.0.0.1:55103";
const PDF_SIGNING_CONNECTOR_MESSAGE =
  "GSTSigner local service is reachable. WorkLine still needs a PDF signing connector to prepare the PDF hash, call the DSC token signer, and embed the returned signature.";
const EMSIGNER_HOSTS = ["127.0.0.1", "localhost", "::1"];
const EMSIGNER_PORTS = [1585, 1645, 2015, 2095, 2565];
const EMSIGNER_ENDPOINTS = EMSIGNER_PORTS.flatMap((port) =>
  EMSIGNER_HOSTS.map((host) => ({ host, port }))
);
const EMSIGNER_INSTALL_PATHS =
  process.platform === "win32"
    ? [
        path.join(process.env.ProgramFiles || "C:\\Program Files", "GSTSigner"),
        path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "GSTSigner"),
        "C:\\GSTSigner",
        "C:\\GSTSigner\\GSTSigner",
        path.join(process.env.ProgramFiles || "C:\\Program Files", "emSigner"),
        path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "emSigner"),
        path.join(os.homedir(), "AppData", "Local", "Programs", "GSTSigner"),
        path.join(os.homedir(), "AppData", "Local", "Programs", "emSigner"),
      ]
    : [];
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

function requestLocalEndpoint({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    socket.setTimeout(1200);
    socket.on("connect", () => {
      socket.destroy();
      resolve({ host, ok: true, port, protocol: "tcp:" });
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

function requestNicSignerHealth() {
  return new Promise((resolve) => {
    const request = https.request(
      `${NIC_SIGNER_URL}/check/isLive`,
      {
        headers: {
          Host: "127.0.0.1:55103",
        },
        method: "GET",
        rejectUnauthorized: false,
        timeout: 1800,
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          const versionMatch = body.match(/Digital Signer Service version\s*:\s*([0-9.]+)/i);

          resolve({
            body,
            ok: response.statusCode === 200 && /success/i.test(body),
            statusCode: response.statusCode || 0,
            url: NIC_SIGNER_URL,
            version: versionMatch?.[1] || "",
          });
        });
      },
    );

    request.on("error", () => resolve({ ok: false, url: NIC_SIGNER_URL }));
    request.on("timeout", () => {
      request.destroy();
      resolve({ ok: false, timedOut: true, url: NIC_SIGNER_URL });
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

function commandOutput(command, args, timeout = 2500) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, windowsHide: true }, (error, stdout) => {
      resolve(error ? "" : stdout);
    });
  });
}

function commandResult(command, args, timeout = 2500) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        error: error?.message || "",
        stderr: stderr || "",
        stdout: stdout || "",
      });
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function detectEmSignerProcess() {
  if (process.platform !== "win32") {
    return null;
  }

  const output = await commandOutput("powershell.exe", [
    "-NoProfile",
    "-Command",
    "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and ($_.Name -match 'GSTSigner|emSigner|java|javaw' -or $_.CommandLine -match 'GSTSigner|emSigner') } | Select-Object -First 5 Name,CommandLine | ConvertTo-Json -Compress",
  ]);

  if (!output.trim()) {
    return null;
  }

  try {
    return JSON.parse(output);
  } catch {
    return { raw: output.trim() };
  }
}

function detectEmSignerInstallPath() {
  return EMSIGNER_INSTALL_PATHS.find((installPath) => fs.existsSync(installPath)) || null;
}

function detectEmSignerLauncher(installPath) {
  if (!installPath) {
    return null;
  }

  const candidates = [
    path.join(installPath, "GSTSigner.exe"),
    path.join(installPath, "GSTSigner", "GSTSigner.exe"),
    path.join(installPath, "emSigner.exe"),
    path.join(installPath, "emSigner", "emSigner.exe"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function restartEmSignerService(installPath) {
  if (process.platform !== "win32") {
    return { attempted: false, reason: "unsupported-platform" };
  }

  const launcherPath = detectEmSignerLauncher(installPath);
  if (!launcherPath) {
    return { attempted: false, reason: "launcher-not-found" };
  }

  const escapedLauncherPath = launcherPath.replaceAll("'", "''");
  const result = await commandResult(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      [
        `$launcher = '${escapedLauncherPath}'`,
        "$javaCandidates = @((Join-Path $env:ProgramFiles 'Java\\jre1.8.0_251\\bin\\javaw.exe'), (Join-Path ${env:ProgramFiles(x86)} 'Java\\jre1.8.0_251\\bin\\javaw.exe'))",
        "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and ($_.CommandLine -match 'GSTSigner|emSigner' -or $_.Name -match 'GSTSigner|emSigner') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
        "Start-Sleep -Seconds 2",
        "$java = $javaCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1",
        "if ($java) {",
        "  Start-Process -FilePath $java -ArgumentList @('-jar', $launcher) -WindowStyle Hidden",
        "} else {",
        "  Start-Process -FilePath $launcher -WindowStyle Hidden",
        "}",
        "Write-Output 'restart-attempted'",
      ].join("; "),
    ],
    10000,
  );
  const output = result.stdout;

  return {
    attempted: output.includes("restart-attempted"),
    launcherPath,
    reason: output.includes("restart-attempted") ? undefined : result.stderr || result.error || "restart-command-failed",
  };
}

async function detectEmSignerState() {
  const endpoint = await detectEmSigner();
  const processInfo = await detectEmSignerProcess();
  const installPath = detectEmSignerInstallPath();
  const installed = Boolean(installPath || processInfo || endpoint);

  return {
    endpoint,
    installPath,
    installed,
    process: processInfo,
    running: Boolean(endpoint),
  };
}

async function detectEmSignerStateWithRecovery() {
  const initialState = await detectEmSignerState();

  if (initialState.running || !initialState.installed) {
    return { ...initialState, recovery: { attempted: false } };
  }

  const recovery = await restartEmSignerService(initialState.installPath);
  if (!recovery.attempted) {
    return { ...initialState, recovery };
  }

  await wait(6000);
  const recoveredState = await detectEmSignerState();

  return {
    ...recoveredState,
    recovery,
  };
}

async function detectSigningEngines() {
  const [nicSigner, emSigner] = await Promise.all([
    requestNicSignerHealth(),
    detectEmSignerStateWithRecovery(),
  ]);

  return {
    emSigner,
    nicSigner,
    preferred: nicSigner.ok ? "nic-digital-signer-service" : emSigner.running ? "gstsigner" : "none",
  };
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
    const engines = await detectSigningEngines();
    const { emSigner, nicSigner } = engines;
    const hasNicSigner = Boolean(nicSigner.ok);

    sendJson(
      response,
      200,
      {
        canSignPdfs: false,
        emSigner,
        emSignerDownloadUrl: EMSIGNER_DOWNLOAD_URL,
        engine: hasNicSigner
          ? "nic-digital-signer-service-detected"
          : emSigner.running
            ? "pdf-connector-pending"
            : emSigner.installed
              ? "emsigner-installed-not-running"
              : "emsigner-missing",
        engines,
        helper: "workline-dsc",
        helperVersion: HELPER_VERSION,
        nicSigner,
        pdfSigning: {
          signatureMode: "single_document_signature",
          visiblePlacements: ["all_pages", "first_page", "last_page"],
        },
        message: hasNicSigner
          ? `NIC Digital Signer Service ${nicSigner.version || ""} is running on this computer. WorkLine can use this service as the next PDF signing engine; the request XML connector is being wired.`
          : emSigner.running
          ? emSigner.recovery?.attempted
            ? "GSTSigner was stuck, so WorkLine restarted it and reached the local signing service."
            : PDF_SIGNING_CONNECTOR_MESSAGE
          : emSigner.installed
            ? emSigner.recovery?.attempted
              ? "WorkLine restarted GSTSigner, but port 1585 is still not reachable. Allow any firewall prompt or reinstall GSTSigner."
              : "GSTSigner is installed or running as a process, but WorkLine cannot reach its local signing service on port 1585. Fully exit GSTSigner/emSigner, reopen it, allow any firewall prompt, then click Check again."
            : "WorkLine DSC helper cannot reach the GSTSigner/emSigner local signing service. If GSTSigner is installed, open it from Start Menu, allow any firewall prompt, then click Check again.",
        status: "ready",
      },
      origin,
    );
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/sign") {
    await drainRequest(request);
    const engines = await detectSigningEngines();
    const { emSigner, nicSigner } = engines;

    if (nicSigner.ok) {
      sendJson(
        response,
        501,
        {
          engine: "nic-digital-signer-service-detected",
          engines,
          error: "NIC Digital Signer Service is running, but WorkLine still needs the signer_service XML request mapping before it can generate signed PDFs automatically.",
          nextStep: "Use Duplicate DSC Sign for visual copies now, or sign batches in the NIC Digital Signing Tool while WorkLine's XML connector is completed.",
          nicSigner,
        },
        origin,
      );
      return;
    }

    if (!emSigner.running) {
      sendJson(
        response,
        409,
        {
          emSignerDownloadUrl: EMSIGNER_DOWNLOAD_URL,
          error: emSigner.installed
            ? "GSTSigner is installed, but its local signing service is not reachable."
            : "GSTSigner/emSigner is not running on this computer.",
          nextStep: "Open GSTSigner/emSigner from Start Menu, insert DSC, allow any firewall prompt, then click Check again.",
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
        error: "GSTSigner local service is reachable, but WorkLine PDF signing is not connected yet.",
        nextStep:
          "Connect a PDF signing engine or vendor DSC SDK that can create the PDF byte range/hash, ask the USB token to sign it, and embed the returned CMS signature. WorkLine already sends visiblePlacement for first page, last page, or all pages.",
        pdfSigning: {
          signatureMode: "single_document_signature",
          visiblePlacements: ["all_pages", "first_page", "last_page"],
        },
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
