export const LOCAL_GST_HELPER_URL = "http://127.0.0.1:48782";
export const GST_HELPER_PROTOCOL = "workline-gst";
export const GST_HELPER_INSTALL_PROTOCOL = "workline-gst-install";
export const GST_HELPER_PORTABLE_ZIP = "/WorkLineGSTHelper-Windows.zip";

export type GstHelperStatus = "ready" | "missing" | "checking";

export async function checkGstHelperReady(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_GST_HELPER_URL}/health`, {
      method: "GET",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function buildGstHelperProtocolUrl(gstin: string) {
  const params = new URLSearchParams({ gstin: gstin.trim().toUpperCase() });
  return `${GST_HELPER_PROTOCOL}://start?${params.toString()}`;
}

/** Ask the registered desktop helper to start (no-op if protocol is not installed). */
export function launchGstHelperViaProtocol(gstin: string) {
  const url = buildGstHelperProtocolUrl(gstin);
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = url;
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 2000);
}

export function launchGstHelperInstallViaProtocol() {
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = `${GST_HELPER_INSTALL_PROTOCOL}://setup`;
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 2000);
}

/** Recommended install for many laptops: portable ZIP with Node + dependencies included. */
export function downloadPortableGstHelper(origin: string) {
  const link = document.createElement("a");
  link.href = `${origin}${GST_HELPER_PORTABLE_ZIP}`;
  link.download = "WorkLineGSTHelper-Windows.zip";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function waitForGstHelperReady(timeoutMs = 12_000, intervalMs = 800): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await checkGstHelperReady()) {
      return true;
    }

    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }

  return false;
}
