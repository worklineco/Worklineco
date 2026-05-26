import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

function resolveSiteOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost.split(",")[0]?.trim()}`;
  }

  return requestUrl.origin;
}

export async function GET(request: Request) {
  const origin = resolveSiteOrigin(request);
  const templatePath = path.join(process.cwd(), "scripts", "WorkLineGSTHelperSetup.vbs");
  const template = await readFile(templatePath, "utf8");
  const launcher = template.replaceAll("{{ORIGIN}}", origin);

  return new NextResponse(launcher, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="WorkLineGSTHelperSetup.vbs"',
      "Cache-Control": "no-store",
    },
  });
}
