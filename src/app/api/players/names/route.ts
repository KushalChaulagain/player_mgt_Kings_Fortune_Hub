import { listAllPlayerNames } from "@/lib/sheets";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/players/names
 *
 * Returns unique FB display names for native datalist autocomplete.
 */
export async function GET() {
  try {
    const names = await listAllPlayerNames();
    return NextResponse.json({ ok: true, names });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/players/names] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
