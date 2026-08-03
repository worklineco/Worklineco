/**
 * WorkLine DSC helper (v12).
 *
 * Local Windows companion service for worklineco.com. It signs PDFs with the
 * user's DSC (Digital Signature Certificate) USB token through the Windows
 * certificate store:
 *
 *   - GET  /health        -> helper status
 *   - GET  /certificates  -> signing certificates available on this computer
 *   - POST /sign          -> sign a prepared PDF (raw application/pdf body)
 *
 * The WorkLine web app prepares each PDF in the browser (visible signature
 * boxes + signature field with /ByteRange and /Contents placeholders). This
 * helper hashes the byte range, asks Windows CryptoAPI to create a detached
 * CMS/PKCS#7 signature with the selected certificate (the DSC token shows
 * its PIN prompt), and embeds the signature into the placeholder.
 *
 * No npm dependencies - Node.js built-ins plus PowerShell only.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.WORKLINE_DSC_HELPER_PORT || 48783);
const HELPER_VERSION = "v12";
const MAX_PDF_BYTES = 120 * 1024 * 1024;
const SIGN_TIMEOUT_MS = 180_000; // generous: the user may be typing the token PIN
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

const isWindows = process.platform === "win32";

function isAllowedOrigin(origin) {
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Headers": "Content-Type,X-Workline-Cert-Thumbprint,X-Workline-Filename",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Allow-Origin": origin || "null",
    "Access-Control-Expose-Headers": "Content-Disposition",
    "Vary": "Origin",
  };
}

function sendJson(response, status, payload, origin) {
  response.writeHead(status, {
    ...corsHeaders(origin),
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

function sendPdf(response, bytes, filename, origin) {
  response.writeHead(200, {
    ...corsHeaders(origin),
    "Content-Disposition": `attachment; filename="${filename.replace(/["\\\r\n]/g, "")}"`,
    "Content-Length": bytes.length,
    "Content-Type": "application/pdf",
  });
  response.end(bytes);
}

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`The PDF is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB helper limit.`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function runPowerShell(args, timeout) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args],
      { maxBuffer: 16 * 1024 * 1024, timeout, windowsHide: true },
      (error, stdout, stderr) => {
        resolve({
          error: error ? error.message : "",
          killed: Boolean(error?.killed),
          stderr: stderr || "",
          stdout: stdout || "",
        });
      },
    );
  });
}

// --------------------------------------------------------------------------
// Certificates
// --------------------------------------------------------------------------

const LIST_CERTIFICATES_COMMAND = [
  "$ErrorActionPreference = 'Stop';",
  "$now = Get-Date;",
  "$certs = @(Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt $now -and $_.NotBefore -lt $now });",
  "$list = @($certs | ForEach-Object { [PSCustomObject]@{ thumbprint = $_.Thumbprint; subject = $_.Subject; issuer = $_.Issuer; notBefore = $_.NotBefore.ToString('o'); notAfter = $_.NotAfter.ToString('o') } });",
  "ConvertTo-Json -Depth 3 -Compress -InputObject $list",
].join(" ");

function extractCommonName(distinguishedName) {
  const match = String(distinguishedName ?? "").match(/CN=([^,]+)/i);
  return (match ? match[1] : String(distinguishedName ?? "")).trim();
}

async function listCertificates() {
  const result = await runPowerShell(["-Command", LIST_CERTIFICATES_COMMAND], 20_000);

  if (result.error && !result.stdout.trim()) {
    throw new Error(`Could not read the Windows certificate store. ${result.stderr || result.error}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim() || "[]");
  } catch {
    throw new Error("Could not parse the Windows certificate list.");
  }

  const rawList = Array.isArray(parsed) ? parsed : [parsed];
  return rawList
    .filter((item) => item && item.thumbprint)
    .map((item) => ({
      commonName: extractCommonName(item.subject),
      issuerName: extractCommonName(item.issuer),
      notAfter: item.notAfter,
      notBefore: item.notBefore,
      subject: item.subject,
      thumbprint: String(item.thumbprint).toUpperCase(),
    }));
}

// --------------------------------------------------------------------------
// Signing
// --------------------------------------------------------------------------

const SIGN_SCRIPT = `param(
  [Parameter(Mandatory = $true)][string]$Thumbprint,
  [Parameter(Mandatory = $true)][string]$DataPath,
  [Parameter(Mandatory = $true)][string]$OutPath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$cert = Get-ChildItem Cert:\\CurrentUser\\My |
  Where-Object { $_.Thumbprint -eq $Thumbprint } |
  Select-Object -First 1

if (-not $cert) {
  throw "CERT_NOT_FOUND: No certificate with thumbprint $Thumbprint. Insert the DSC token and try again."
}

$content = [System.IO.File]::ReadAllBytes($DataPath)
$contentInfo = New-Object System.Security.Cryptography.Pkcs.ContentInfo -ArgumentList @(,$content)
$signedCms = New-Object System.Security.Cryptography.Pkcs.SignedCms -ArgumentList $contentInfo, $true
$signer = New-Object System.Security.Cryptography.Pkcs.CmsSigner -ArgumentList $cert
$signer.DigestAlgorithm = New-Object System.Security.Cryptography.Oid -ArgumentList '2.16.840.1.101.3.4.2.1'
$signer.IncludeOption = [System.Security.Cryptography.X509Certificates.X509IncludeOption]::WholeChain
$null = $signer.SignedAttributes.Add((New-Object System.Security.Cryptography.Pkcs.Pkcs9SigningTime))

# silent = $false so the token's CSP can show its PIN prompt.
$signedCms.ComputeSignature($signer, $false)
[System.IO.File]::WriteAllBytes($OutPath, $signedCms.Encode())
Write-Output 'workline-signed'
`;

function parseByteRange(pdf) {
  // Use the LAST byte range in the file: the placeholder WorkLine just added
  // is the newest object, and any older (already signed) field must be left
  // untouched.
  const keyIndex = pdf.lastIndexOf("/ByteRange");
  if (keyIndex < 0) {
    return { error: "The PDF does not contain a signature byte range. Prepare it from WorkLine PDF & Indexing." };
  }

  const openIndex = pdf.indexOf("[", keyIndex);
  const closeIndex = pdf.indexOf("]", openIndex);
  if (openIndex < 0 || closeIndex < 0) {
    return { error: "The PDF signature byte range is malformed." };
  }

  const numbers = pdf
    .subarray(openIndex + 1, closeIndex)
    .toString("latin1")
    .trim()
    .split(/\s+/)
    .map((part) => Number(part));

  if (numbers.length !== 4 || numbers.some((value) => !Number.isInteger(value) || value < 0)) {
    return { error: "The PDF signature byte range values are invalid. Prepare the PDF again from WorkLine." };
  }

  const [start, holeStart, holeEnd, tailLength] = numbers;
  if (
    start !== 0 ||
    holeStart >= holeEnd ||
    holeEnd + tailLength !== pdf.length ||
    pdf[holeStart] !== 0x3c || // <
    pdf[holeEnd - 1] !== 0x3e // >
  ) {
    return { error: "The PDF signature placeholder does not match its byte range. Prepare the PDF again from WorkLine." };
  }

  return { holeEnd, holeStart, tailLength };
}

function friendlySigningError(rawMessage) {
  const message = String(rawMessage ?? "");
  if (/CERT_NOT_FOUND/i.test(message)) {
    return "The selected DSC certificate was not found. Insert the DSC USB token, then click Check and try again.";
  }
  if (/cancel|0x8010006E|SCARD_W_CANCELLED/i.test(message)) {
    return "PIN entry was cancelled on the DSC token. Try signing again and enter the token PIN.";
  }
  if (/incorrect pin|wrong pin|0x8010006B/i.test(message)) {
    return "The DSC token reported an incorrect PIN. Try again carefully - tokens lock after repeated wrong PINs.";
  }
  if (/smart card|card is not|no card|0x8010000C|removed/i.test(message)) {
    return "Windows could not reach the DSC USB token. Re-insert the token and try again.";
  }
  return `The DSC token could not sign this PDF. ${message.slice(0, 400)}`.trim();
}

async function signPdf(pdf, thumbprint) {
  const byteRange = parseByteRange(pdf);
  if (byteRange.error) {
    return { error: byteRange.error, status: 400 };
  }

  const { holeEnd, holeStart } = byteRange;
  const signedData = Buffer.concat([pdf.subarray(0, holeStart), pdf.subarray(holeEnd)]);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "workline-dsc-"));
  const dataPath = path.join(workDir, "byte-range.bin");
  const scriptPath = path.join(workDir, "workline-sign.ps1");
  const outPath = path.join(workDir, "signature.der");

  try {
    fs.writeFileSync(dataPath, signedData);
    fs.writeFileSync(scriptPath, SIGN_SCRIPT);

    const result = await runPowerShell(
      ["-File", scriptPath, "-Thumbprint", thumbprint, "-DataPath", dataPath, "-OutPath", outPath],
      SIGN_TIMEOUT_MS,
    );

    if (result.killed) {
      return {
        error: "Signing timed out. If the token PIN prompt appeared, enter the PIN sooner and try again.",
        status: 504,
      };
    }
    if (!result.stdout.includes("workline-signed") || !fs.existsSync(outPath)) {
      return { error: friendlySigningError(result.stderr || result.error), status: 502 };
    }

    const signature = fs.readFileSync(outPath);
    const holeCapacity = holeEnd - holeStart - 2; // hex characters available
    const signatureHex = signature.toString("hex");

    if (signatureHex.length > holeCapacity) {
      return {
        error: "The DSC signature is larger than the space reserved in this PDF. Prepare the PDF again from WorkLine and retry.",
        status: 502,
      };
    }

    const signed = Buffer.from(pdf);
    signed.write(signatureHex, holeStart + 1, "latin1");
    return { signed };
  } finally {
    fs.rmSync(workDir, { force: true, recursive: true });
  }
}

// --------------------------------------------------------------------------
// HTTP server
// --------------------------------------------------------------------------

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
        canSignPdfs: isWindows,
        engine: isWindows ? "windows-certificate-store" : "unsupported-platform",
        helper: "workline-dsc",
        helperVersion: HELPER_VERSION,
        message: isWindows
          ? "WorkLine DSC helper is ready. Insert the DSC USB token and pick a certificate to sign."
          : "DSC signing requires Windows with the token drivers installed.",
        pdfSigning: {
          signatureMode: "single_document_signature",
          visiblePlacements: ["all_pages", "first_page", "last_page"],
        },
        status: "ready",
      },
      origin,
    );
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/certificates") {
    if (!isWindows) {
      sendJson(response, 501, { error: "DSC signing requires Windows with the token drivers installed." }, origin);
      return;
    }

    try {
      const certificates = await listCertificates();
      sendJson(
        response,
        200,
        {
          certificates,
          message: certificates.length
            ? `${certificates.length} signing certificate${certificates.length === 1 ? "" : "s"} available.`
            : "No signing certificates found. Insert the DSC USB token (with its driver installed), then click Check again.",
        },
        origin,
      );
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Could not list certificates." }, origin);
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/sign") {
    if (!isWindows) {
      sendJson(response, 501, { error: "DSC signing requires Windows with the token drivers installed." }, origin);
      return;
    }

    const thumbprint = String(request.headers["x-workline-cert-thumbprint"] || "").trim().toUpperCase();
    if (!/^[0-9A-F]{20,}$/.test(thumbprint)) {
      sendJson(response, 400, { error: "Select a DSC certificate before signing." }, origin);
      return;
    }

    let pdf;
    try {
      pdf = await readBody(request, MAX_PDF_BYTES);
    } catch (error) {
      sendJson(response, 413, { error: error instanceof Error ? error.message : "Could not read the PDF." }, origin);
      return;
    }

    if (!pdf.length || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      sendJson(response, 400, { error: "The request body is not a PDF file." }, origin);
      return;
    }

    try {
      const result = await signPdf(pdf, thumbprint);
      if (result.error) {
        sendJson(response, result.status ?? 502, { error: result.error }, origin);
        return;
      }

      const requestedName = String(request.headers["x-workline-filename"] || "document.pdf");
      const baseName = path.basename(requestedName).replace(/\.pdf$/i, "") || "document";
      sendPdf(response, result.signed, `${baseName}-signed.pdf`, origin);
    } catch (error) {
      sendJson(
        response,
        500,
        { error: error instanceof Error ? friendlySigningError(error.message) : "Could not sign the PDF." },
        origin,
      );
    }
    return;
  }

  sendJson(response, 404, { error: "Unknown WorkLine DSC helper endpoint." }, origin);
});

server.listen(PORT, HOST, () => {
  console.log(`WorkLine DSC helper ${HELPER_VERSION} listening on http://${HOST}:${PORT}`);
  console.log("Keep this running while using DSC signing on worklineco.com/pdf-indexing.");
});
