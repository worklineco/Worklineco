export const NODE_JS_DOWNLOAD_URL = "https://nodejs.org/en/download";
export const GST_HELPER_BUNDLE_ZIP = "/gst-helper-bundle.zip";
export const GST_HELPER_PORTABLE_ZIP = "/WorkLineGSTHelper-Windows.zip";

export const GST_HELPER_INSTALL_FOLDER = "%LOCALAPPDATA%\\WorkLine\\GSTHelper";

/** Run once in Win+R after Node.js MSI + ZIP files are in the install folder. */
export const START_HELPER_RUN_COMMAND =
  'cmd /c "%ProgramFiles%\\nodejs\\node.exe" "%LOCALAPPDATA%\\WorkLine\\GSTHelper\\scripts\\gst-collector-server.mjs"';

/** Run once in Win+R to start the helper automatically at Windows sign-in. */
export const REGISTER_STARTUP_RUN_COMMAND =
  'cmd /c schtasks /Create /TN "WorkLine GST Helper" /TR "cmd /c cd /d \\"%LOCALAPPDATA%\\WorkLine\\GSTHelper\\" && \\"%ProgramFiles%\\nodejs\\node.exe\\" scripts\\gst-collector-server.mjs" /SC ONLOGON /F';

export function downloadGstHelperBundle(origin: string) {
  const link = document.createElement("a");
  link.href = `${origin}${GST_HELPER_BUNDLE_ZIP}`;
  link.download = "gst-helper-bundle.zip";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function copyInstallText(text: string) {
  await navigator.clipboard.writeText(text);
}
