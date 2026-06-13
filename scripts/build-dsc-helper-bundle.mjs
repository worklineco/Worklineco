import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingDir = path.join(os.tmpdir(), `workline-dsc-helper-bundle-${process.pid}`);
const publicDir = path.join(rootDir, "public");
const outputZip = path.join(publicDir, "dsc-helper-bundle-v4.zip");
const outputInstaller = path.join(publicDir, "install-workline-dsc-helper.ps1");
const outputLauncher = path.join(publicDir, "WorkLineDSCHelperSetup.vbs");

const bundleFiles = [
  "package.json",
  "package-lock.json",
  "scripts/dsc-signing-server.mjs",
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

function copyPublicInstallerFiles() {
  fs.mkdirSync(publicDir, { recursive: true });
  fs.copyFileSync(path.join(rootDir, "scripts", "install-workline-dsc-helper.ps1"), outputInstaller);

  const launcherTemplate = fs.readFileSync(path.join(rootDir, "scripts", "WorkLineDSCHelperSetup.vbs"), "utf8");
  fs.writeFileSync(outputLauncher, launcherTemplate.replace("{{ORIGIN}}", "https://worklineco.com"), "ascii");
}

function createZipArchive() {
  fs.mkdirSync(path.dirname(outputZip), { recursive: true });

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
      if (fs.existsSync(outputZip)) {
        console.warn("Could not replace existing dsc-helper-bundle.zip; keeping the current bundle.");
        return;
      }

      throw new Error("Failed to create dsc-helper-bundle.zip with Compress-Archive.");
    }

    return;
  }

  const result = spawnSync("zip", ["-r", outputZip, "."], { cwd: stagingDir, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error("Failed to create dsc-helper-bundle.zip. Install zip or run on Windows.");
  }
}

resetDirectory(stagingDir);
copyBundleFiles();
copyPublicInstallerFiles();
createZipArchive();
try {
  fs.rmSync(stagingDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
} catch (error) {
  console.warn(`Could not remove temporary staging folder: ${error.message}`);
}

console.log(`Created ${outputZip}`);
