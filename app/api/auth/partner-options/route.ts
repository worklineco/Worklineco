import { listTrustedPartnerApprovers } from "@/lib/auth/trusted-partners";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const partners = await listTrustedPartnerApprovers();

    return NextResponse.json(
      {
        partners: partners.map(({ id, name }) => ({ id, name }))
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load approved partners."
      },
      { status: 500 }
    );
  }
}
