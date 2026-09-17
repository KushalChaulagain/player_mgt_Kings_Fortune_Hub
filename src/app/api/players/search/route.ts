import { searchPlayers } from "@/lib/sheets";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/players/search?q=kerry
 *
 * Returns up to 12 players whose FB name matches the query (substring).
 * Used by the admin autocomplete — debounce on the client.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 300);

  if (q.length < 2) {
    return NextResponse.json({ ok: true, players: [] });
  }

  try {
    const players = await searchPlayers(q);
    return NextResponse.json({ ok: true, players });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/players/search] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
