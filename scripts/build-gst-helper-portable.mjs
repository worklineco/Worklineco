import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeVersion = process.env.WORKLINE_GST_NODE_VERSION || "22.15.0";
const stagingDir = path.join(rootDir, ".gst-helper-portable");
const outputZip = path.join(rootDir, "public", "WorkLineGSTHelper-Windows.zip");
const nodeArchiveName = `node-v${nodeVersion}-win-x64.zip`;
const nodeDownloadUrl = `https://nodejs.org/dist/v${nodeVersion}/${nodeArchiveName}`;

const bundleFiles = [
  "package.json",
  "package-lock.json",
  "scripts/gst-collector-server.mjs",
  "scripts/gst-portal-collector.mjs",
  "scripts/gst-helper-home.mjs",
  "scripts/workline-gst-protocol-launch.mjs",
  "scripts/register-portable-helper.ps1",
];

const installBat = `@echo off
title WorkLine GST Helper Setup
echo.
echo Installing WorkLine GST Helper for this PC...
echo.

set "TARGET=%LOCALAPPDATA%\\WorkLine\\GSTHelper"
set "SOURCE=%~dp0"

if /I not "%SOURCE:~0,-1%"=="%TARGET%" (
  echo Copying files to %TARGET%
  if not exist "%TARGET%" mkdir "%TARGET%"
  xcopy /E /I /Y /Q "%SOURCE%*" "%TARGET%\\" >nul
)

cd /d "%TARGET%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%TARGET%\\scripts\\register-portable-helper.ps1" -InstallRoot "%TARGET%"

echo.
echo Setup complete.
echo 1. Put GST credentials in Downloads\\WorkLineCo.xlsx
echo 2. Open https://worklineco.com/gst and click Get data
echo.
pause
`;

const readmeTxt = `WorkLine GST Helper - Windows setup (one time per laptop)
============================================================

1. Extract this ZIP folder (right-click -> Extract All).
2. Open the extracted folder and double-click:
   "Install WorkLine GST Helper.bat"
3. If Windows Smart Screen appears, click More info -> Run anyway.
4. When setup finishes, open https://worklineco.com/gst and click Get data.

Excel file (on this same PC):
  %USERPROFILE%\\Downloads\\WorkLineCo.xlsx
  Column A = GSTIN, B = portal user ID, C = portal password

Support: contact your WorkLine administrator.
`;

function resetDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
}

async function downloadNodeRuntime(targetDir) {
  const archivePath = path.join(targetDir, nodeArchiveName);
  console.log(`Downloading ${nodeDownloadUrl}`);

  const response = await fetch(nodeDownloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Node.js runtime (${response.status}).`);
  }

  const archiveBuffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(archivePath, archiveBuffer);

  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${archivePath}' -DestinationPath '${targetDir}' -Force`,
      ],
      { stdio: "inherit" },
    );

    if (result.status !== 0) {
      throw new Error("Failed to extract Node.js archive on Windows.");
    }
  } else {
    const result = spawnSync("unzip", ["-q", archivePath, "-d", targetDir], { stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error("Failed to extract Node.js archive. Ensure unzip is available in CI.");
    }
  }

  const extractedDir = path.join(targetDir, `node-v${nodeVersion}-win-x64`);
  const nodeDir = path.join(targetDir, "node");
  fs.rmSync(nodeDir, { recursive: true, force: true });
  fs.renameSync(extractedDir, nodeDir);
  fs.rmSync(archivePath, { force: true });
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

function installDependencies() {
  const result = spawnSync("npm", ["ci", "--omit=dev"], {
    cwd: stagingDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error("npm ci failed while building the portable GST helper package.");
  }
}

function writeUserFacingFiles() {
  fs.writeFileSync(path.join(stagingDir, "Install WorkLine GST Helper.bat"), installBat, "utf8");
  fs.writeFileSync(path.join(stagingDir, "README.txt"), readmeTxt, "utf8");
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
      throw new Error("Failed to create WorkLineGSTHelper-Windows.zip.");
    }

    return;
  }

  const result = spawnSync("zip", ["-r", outputZip, "."], { cwd: stagingDir, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error("Failed to create WorkLineGSTHelper-Windows.zip.");
  }
}

resetDirectory(stagingDir);
copyBundleFiles();
await downloadNodeRuntime(stagingDir);
installDependencies();
writeUserFacingFiles();
createZipArchive();
fs.rmSync(stagingDir, { recursive: true, force: true });

const sizeMb = (fs.statSync(outputZip).size / (1024 * 1024)).toFixed(1);
console.log(`Created ${outputZip} (${sizeMb} MB)`);
