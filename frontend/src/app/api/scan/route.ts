import { NextResponse } from "next/server";
import { getTendrilApiToken } from "@/lib/serverConfig";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const source = typeof body.source === "string" ? body.source : "";
    const fileName = typeof body.fileName === "string" ? body.fileName : "contract.sol";
    if (!source.trim()) return NextResponse.json({ error: "Add Solidity source before scanning." }, { status: 400 });

    const apiUrl = process.env.TENDRIL_API_URL || "http://127.0.0.1:8787";
    const token = getTendrilApiToken();
    const response = await fetch(`${apiUrl}/api/scan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ source, fileName, graphName: "tendril" }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({ error: "Invalid analysis response." }));
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: "The analysis service is unavailable." }, { status: 503 });
  }
}
