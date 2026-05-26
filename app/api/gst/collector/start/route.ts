import { NextResponse } from "next/server";

export async function POST(request: Request) {
  await request.json().catch(() => ({}));

  return NextResponse.json(
    {
      error:
        "The GST portal collector cannot be started by the web server. Start the WorkLine GST helper on this computer, then click Get data again. Run: npm run gst:helper",
    },
    { status: 400 },
  );
}
