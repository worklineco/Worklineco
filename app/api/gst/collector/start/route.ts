import { NextResponse } from "next/server";

export async function POST(request: Request) {
  await request.json().catch(() => ({}));

  return NextResponse.json(
    {
      error:
        "The GST portal collector cannot be started by the web server. Use the one-time GST helper setup on this computer from the GST Litigation Monitor page, then click Get data again.",
    },
    { status: 400 },
  );
}
