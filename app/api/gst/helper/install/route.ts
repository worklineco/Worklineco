import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  const scriptPath = path.join(process.cwd(), "scripts", "install-workline-gst-helper.ps1");
  const script = await readFile(scriptPath, "utf8");

  return new NextResponse(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="install-workline-gst-helper.ps1"',
      "Cache-Control": "no-store",
    },
  });
}
