import {
  isReferralBonusStatus,
  updateReferralBonus,
  type ReferralBonusUpdate,
} from "@/lib/sheets";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LEN = 300;

/**
 * POST /api/update-referral-bonus
 *
 * Body: { row?: number, facebookName?: string, facebookLink?: string,
 *         status: "Pending" | "Paid" }
 *
 * `row` is the 1-based sheet row from a previous /api/player lookup and is
 * used as a fast path; the server re-verifies it against `facebookName` and
 * falls back to a link/name search if the sheet has moved. At least one of
 * row / facebookName / facebookLink must be supplied.
 */
function validate(body: unknown): ReferralBonusUpdate | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const b = body as Record<string, unknown>;

  if (!isReferralBonusStatus(b.status)) {
    return 'status must be "Pending" or "Paid"';
  }

  let row: number | undefined;
  if (b.row !== undefined && b.row !== null) {
    if (
      typeof b.row !== "number" ||
      !Number.isInteger(b.row) ||
      b.row < 1 ||
      b.row > 1_000_000
    ) {
      return "row must be a positive integer";
    }
    row = b.row;
  }

  let facebookName: string | undefined;
  if (b.facebookName !== undefined && b.facebookName !== null) {
    if (typeof b.facebookName !== "string" || b.facebookName.length > MAX_LEN)
      return "facebookName must be a string";
    facebookName = b.facebookName.trim() || undefined;
  }

  let facebookLink: string | undefined;
  if (b.facebookLink !== undefined && b.facebookLink !== null) {
    if (typeof b.facebookLink !== "string" || b.facebookLink.length > 2000)
      return "facebookLink must be a string";
    facebookLink = b.facebookLink.trim() || undefined;
  }

  if (row === undefined && !facebookName && !facebookLink) {
    return "Provide row, facebookName or facebookLink to identify the player";
  }

  return { row, facebookName, facebookLink, status: b.status };
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
    const result = await updateReferralBonus(parsed);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/update-referral-bonus] failed:", message);
    const status = /not found/i.test(message) ? 404 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
