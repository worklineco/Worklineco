import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";

type StartCollectorRequest = {
  gstin?: string;
  rowNumber?: number;
};

export async function POST(request: Request) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        error:
          "The GST portal collector must run on the user's computer. Use the local WorkLine app or desktop helper.",
      },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as StartCollectorRequest;
  const rowNumber = Number.isInteger(body.rowNumber) && body.rowNumber! > 1 ? body.rowNumber! : 2;
  const scriptPath = path.join(process.cwd(), "scripts", "gst-portal-collector.mjs");
  const args = [scriptPath, "--login-only", "--row", String(rowNumber)];

  if (body.gstin) {
    args.push("--expect-gstin", body.gstin);
  }

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  child.unref();

  return NextResponse.json({
    message:
      "GST portal login opened. Enter CAPTCHA in Chrome or Edge; the helper will submit login after CAPTCHA is entered.",
    rowNumber,
  });
}
