import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export function getWorklineGstHome() {
  if (process.env.WORKLINE_GST_HOME) {
    return path.resolve(process.env.WORKLINE_GST_HOME);
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const installedHome = path.join(localAppData, "WorkLine", "GSTHelper");
    if (fs.existsSync(path.join(installedHome, "scripts", "gst-collector-server.mjs"))) {
      return installedHome;
    }
  }

  return process.cwd();
}

export function getCollectorOutputDir(home = getWorklineGstHome()) {
  return path.join(home, "collector-output");
}

export function getDefaultWorkbookPath() {
  return path.join(os.homedir(), "Downloads", "WorkLineCo.xlsx");
}
