import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingDir = path.join(rootDir, ".gst-helper-bundle");
const outputZip = path.join(rootDir, "public", "gst-helper-bundle.zip");

const bundleFiles = [
  "package.json",
  "package-lock.json",
  "scripts/gst-collector-server.mjs",
  "scripts/gst-portal-collector.mjs",
  "scripts/gst-helper-home.mjs",
  "scripts/workline-gst-protocol-launch.mjs",
  "scripts/WorkLineGSTHelperSetup.vbs",
];

function resetDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
}

function copyBundleFiles() {
  for (const relativePath of bundleFiles) {
    const sourcePath = path.join(rootDir, relativePath);
    const targetPath = path.join(stagingDir, relativePath);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing bundle file: ${sourcePath}`);
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function createZipArchive() {
  fs.mkdirSync(path.dirname(outputZip), { recursive: true });
  if (fs.existsSync(outputZip)) {
    fs.unlinkSync(outputZip);
  }

  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${outputZip}' -Force`,
      ],
      { stdio: "inherit" },
    );

    if (result.status !== 0) {
      throw new Error("Failed to create gst-helper-bundle.zip with Compress-Archive.");
    }

    return;
  }

  const result = spawnSync("zip", ["-r", outputZip, "."], { cwd: stagingDir, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error("Failed to create gst-helper-bundle.zip. Install zip or run on Windows.");
  }
}

resetDirectory(stagingDir);
copyBundleFiles();
createZipArchive();
fs.rmSync(stagingDir, { recursive: true, force: true });

console.log(`Created ${outputZip}`);
