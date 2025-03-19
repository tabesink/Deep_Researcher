import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tokenLimit = process.env.TOKEN_LIMIT
    ? parseInt(process.env.TOKEN_LIMIT)
    : 4096;

  return NextResponse.json(
    {
      tokenLimit: tokenLimit,
    },
    { status: 200 }
  );
}
