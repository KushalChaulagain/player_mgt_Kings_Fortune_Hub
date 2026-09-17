import { isGameCode, type GameCode } from "@/lib/games";
import { addPlayerGame, type AddGamePayload } from "@/lib/sheets";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LEN = 300;

/**
 * POST /api/players/add-game
 *
 * Body: { row, facebookName, facebookLink?, gameCode }
 *
 * Adds a single platform ID to an existing player row. The server verifies
 * the row still matches the supplied name (and link when provided) before
 * writing.
 */
function validate(body: unknown): AddGamePayload | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const b = body as Record<string, unknown>;

  if (
    typeof b.row !== "number" ||
    !Number.isInteger(b.row) ||
    b.row < 1 ||
    b.row > 1_000_000
  ) {
    return "row must be a positive integer";
  }

  if (
    typeof b.facebookName !== "string" ||
    b.facebookName.trim().length === 0 ||
    b.facebookName.length > MAX_LEN
  ) {
    return "facebookName is required";
  }

  let facebookLink: string | undefined;
  if (b.facebookLink !== undefined && b.facebookLink !== null) {
    if (typeof b.facebookLink !== "string" || b.facebookLink.length > 2000) {
      return "facebookLink must be a string";
    }
    facebookLink = b.facebookLink.trim() || undefined;
  }

  if (!isGameCode(b.gameCode)) {
    return `Unknown platform code: ${String(b.gameCode)}`;
  }

  return {
    row: b.row,
    facebookName: b.facebookName.trim(),
    facebookLink,
    gameCode: b.gameCode as GameCode,
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = validate(body);
  if (typeof parsed === "string") {
    return NextResponse.json({ ok: false, error: parsed }, { status: 400 });
  }

  try {
    const result = await addPlayerGame(parsed);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/players/add-game] failed:", message);
    const status = /row mismatch|shifted/i.test(message)
      ? 409
      : message === "SHEET_WRITE_TIMEOUT"
        ? 504
        : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
