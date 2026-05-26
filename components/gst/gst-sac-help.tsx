"use client";

import {
  GST_HELPER_INSTALL_FOLDER,
  GST_HELPER_PORTABLE_ZIP,
  NODE_JS_DOWNLOAD_URL,
  REGISTER_STARTUP_RUN_COMMAND,
  START_HELPER_RUN_COMMAND,
  copyInstallText,
  downloadGstHelperBundle,
} from "@/lib/gst-sac-safe-install";
import { downloadPortableGstHelper } from "@/lib/gst-local-helper";
import { AlertCircle, Copy } from "lucide-react";
import { useState } from "react";

type GstSacHelpProps = {
  origin: string;
};

export function GstSacHelp({ origin }: GstSacHelpProps) {
  const [copiedKey, setCopiedKey] = useState("");

  async function handleCopy(key: string, text: string) {
    await copyInstallText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(""), 2500);
  }

  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <p className="font-black">Windows blocked the install (Smart App Control)</p>
      </div>
      <p className="mt-2 font-semibold leading-6">
        Do not use the old <strong>.vbs</strong> file. Use this path instead — it uses the official Node.js
        installer (Microsoft-trusted) and avoids blocked .bat scripts.
      </p>

      <div className="mt-4 space-y-4">
        <section>
          <p className="font-black">Option A — Turn off Smart App Control (if available)</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 font-semibold leading-6">
            <li>Open Settings → Privacy &amp; security → Windows Security</li>
            <li>App &amp; browser control → Smart App Control settings</li>
            <li>If you see Evaluation mode, set it to Off, run the .bat once, then turn it back on</li>
          </ol>
        </section>

        <section>
          <p className="font-black">Option B — Safe install (recommended when blocked)</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5 font-semibold leading-6">
            <li>
              Install Node.js LTS using the official Windows installer (.msi):{" "}
              <a className="underline" href={NODE_JS_DOWNLOAD_URL} rel="noreferrer" target="_blank">
                nodejs.org/download
              </a>{" "}
              (click through Smart Screen with More info → Run anyway if needed).
            </li>
            <li>
              Download{" "}
              <button
                className="font-black underline"
                onClick={() => downloadPortableGstHelper(origin)}
                type="button"
              >
                WorkLineGSTHelper-Windows.zip
              </button>{" "}
              (or the smaller{" "}
              <button className="font-black underline" onClick={() => downloadGstHelperBundle(origin)} type="button">
                gst-helper-bundle.zip
              </button>{" "}
              only if an IT person will run npm for you).
            </li>
            <li>
              Extract the ZIP so files are inside this folder (paste in File Explorer address bar):
              <code className="mt-1 block rounded-lg bg-white px-2 py-1 text-xs">{GST_HELPER_INSTALL_FOLDER}</code>
            </li>
            <li>
              Press <strong>Win+R</strong>, paste the start command below, press Enter (no PowerShell window):
              <CopyRow
                copied={copiedKey === "start"}
                label="Copy start command"
                onCopy={() => void handleCopy("start", START_HELPER_RUN_COMMAND)}
                text={START_HELPER_RUN_COMMAND}
              />
            </li>
            <li>
              Press <strong>Win+R</strong> again, paste the startup command, press Enter:
              <CopyRow
                copied={copiedKey === "task"}
                label="Copy startup command"
                onCopy={() => void handleCopy("task", REGISTER_STARTUP_RUN_COMMAND)}
                text={REGISTER_STARTUP_RUN_COMMAND}
              />
            </li>
            <li>Return here and click Check helper connection.</li>
          </ol>
        </section>
      </div>

      <p className="mt-3 text-xs font-semibold">
        Portable ZIP path: {origin}
        {GST_HELPER_PORTABLE_ZIP}
      </p>
    </div>
  );
}

function CopyRow({
  copied,
  label,
  onCopy,
  text,
}: {
  copied: boolean;
  label: string;
  onCopy: () => void;
  text: string;
}) {
  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-white p-2">
      <code className="block break-all text-xs text-slate-800">{text}</code>
      <button
        className="mt-2 inline-flex items-center gap-1 text-xs font-black text-teal-800 underline"
        onClick={onCopy}
        type="button"
      >
        <Copy className="size-3" />
        {copied ? "Copied" : label}
      </button>
    </div>
  );
}
