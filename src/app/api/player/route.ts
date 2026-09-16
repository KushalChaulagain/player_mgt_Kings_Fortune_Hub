import { lookupPlayer } from "@/lib/sheets";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/player?name=Kerry%20Romero&link=https://facebook.com/...
 *
 * Read-only lookup used by the form to warn the admin that a player already
 * exists (and which platforms they already have) before they hit submit.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = (url.searchParams.get("name") ?? "").trim().slice(0, 300);
  const link = (url.searchParams.get("link") ?? "").trim().slice(0, 2000);

  if (name.length < 2 && link.length < 8) {
    return NextResponse.json({ ok: true, found: false, player: null });
  }

  try {
    const player = await lookupPlayer({
      facebookName: name,
      facebookLink: link,
    });
    return NextResponse.json({ ok: true, found: !!player, player });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/player] lookup failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
