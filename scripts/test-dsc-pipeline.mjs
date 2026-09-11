/**
 * Structural test for the DSC signing pipeline (dev/CI only, no token needed).
 *
 * Simulates the full flow with a software certificate:
 *   1. browser prep (lib/pdf-signing.ts): placeholder + byte range
 *   2. helper: parse byte range, detached CMS via openssl, embed signature
 *   3. verify: openssl cms -verify over the embedded signature + byte range
 *
 * Usage: node scripts/test-dsc-pipeline.mjs /tmp/pdf-signing.mjs
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { PDFDocument } from "pdf-lib";

const preparedModulePath = process.argv[2];
if (!preparedModulePath) {
  console.error("Usage: node scripts/test-dsc-pipeline.mjs <bundled-pdf-signing.mjs>");
  process.exit(1);
}

const { preparePdfForDscSigning } = await import(preparedModulePath);

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "workline-dsc-test-"));
const run = (command, args) => execFileSync(command, args, { cwd: workDir, stdio: "pipe" }).toString();

// 1. Make a 3-page source PDF.
const sourceDoc = await PDFDocument.create();
for (let page = 0; page < 3; page += 1) {
  const created = sourceDoc.addPage([595, 842]);
  created.drawText(`WorkLine DSC pipeline test - page ${page + 1}`, { size: 14, x: 60, y: 780 });
}
const sourceBytes = await sourceDoc.save();

// 2. Browser-side preparation.
const prepared = await preparePdfForDscSigning(sourceBytes.buffer.slice(0), {
  placement: "all_pages",
  reason: "WorkLine DSC filing",
  signedAt: new Date("2026-08-03T12:00:00+05:30"),
  signerName: "Test Signatory"
});
const pdf = Buffer.from(prepared);

// 3. Helper-side: parse the byte range exactly as scripts/dsc-signing-server.mjs does.
const keyIndex = pdf.lastIndexOf("/ByteRange");
const openIndex = pdf.indexOf("[", keyIndex);
const closeIndex = pdf.indexOf("]", openIndex);
const numbers = pdf.subarray(openIndex + 1, closeIndex).toString("latin1").trim().split(/\s+/).map(Number);
const [start, holeStart, holeEnd, tailLength] = numbers;

if (start !== 0 || holeEnd + tailLength !== pdf.length || pdf[holeStart] !== 0x3c || pdf[holeEnd - 1] !== 0x3e) {
  throw new Error(`Byte range mismatch: ${JSON.stringify(numbers)} for file of ${pdf.length} bytes`);
}
console.log(`byte range OK: ${JSON.stringify(numbers)} (file ${pdf.length} bytes)`);

const signedData = Buffer.concat([pdf.subarray(0, holeStart), pdf.subarray(holeEnd)]);
fs.writeFileSync(path.join(workDir, "byte-range.bin"), signedData);

// 4. Software certificate + detached CMS (stand-in for the Windows token).
run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", "key.pem", "-out", "cert.pem", "-days", "2", "-nodes", "-subj", "/CN=Test Signatory/O=WorkLine Test"]);
run("openssl", ["cms", "-sign", "-binary", "-in", "byte-range.bin", "-signer", "cert.pem", "-inkey", "key.pem", "-outform", "DER", "-out", "signature.der", "-md", "sha256"]);

const signature = fs.readFileSync(path.join(workDir, "signature.der"));
const holeCapacity = holeEnd - holeStart - 2;
const signatureHex = signature.toString("hex");
if (signatureHex.length > holeCapacity) {
  throw new Error(`Signature too large: ${signatureHex.length} hex chars for ${holeCapacity} capacity`);
}

const signedPdf = Buffer.from(pdf);
signedPdf.write(signatureHex, holeStart + 1, "latin1");
fs.writeFileSync(path.join(workDir, "signed.pdf"), signedPdf);
console.log(`signature embedded: ${signature.length} DER bytes into ${holeCapacity / 2} reserved bytes`);

// 5. Verify: extract /Contents + byte range from the final file and check the CMS.
const contentsHex = signedPdf.subarray(holeStart + 1, holeEnd - 1).toString("latin1").replace(/0+$/, (match) => (match.length % 2 ? match.slice(1) : ""));
const extracted = Buffer.from(contentsHex.slice(0, signatureHex.length), "hex");
fs.writeFileSync(path.join(workDir, "extracted.der"), extracted);
const verification = run("openssl", ["cms", "-verify", "-binary", "-content", "byte-range.bin", "-inform", "DER", "-in", "extracted.der", "-noverify", "-out", "/dev/null"]);
console.log(`openssl cms verify: success${verification.trim() ? ` (${verification.trim()})` : ""}`);

// 6. The signed file must still be a loadable PDF with our signature field.
const reloaded = await PDFDocument.load(signedPdf, { updateMetadata: false });
console.log(`signed PDF reloads: ${reloaded.getPageCount()} pages`);

const text = signedPdf.toString("latin1");
for (const marker of ["/SubFilter /adbe.pkcs7.detached", "/Filter /Adobe.PPKLite", "/FT /Sig", "/SigFlags 3"]) {
  if (!text.includes(marker)) {
    throw new Error(`Missing marker in signed PDF: ${marker}`);
  }
}
console.log("signature dictionary markers OK");

fs.rmSync(workDir, { force: true, recursive: true });
console.log("DSC pipeline structural test PASSED");
