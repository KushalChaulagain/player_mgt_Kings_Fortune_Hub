import { NextResponse } from "next/server";
import { isGameCode, type GameCode } from "@/lib/games";
import { registerPlayer, type RegistrationPayload } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LEN = 300;

function isNonEmptyString(v: unknown, max = MAX_LEN): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

function validate(body: unknown): RegistrationPayload | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.facebookName)) return "facebookName is required";
  if (!isNonEmptyString(b.facebookLink, 2000)) return "facebookLink is required";

  if (
    b.referralName !== undefined &&
    b.referralName !== null &&
    (typeof b.referralName !== "string" || b.referralName.length > MAX_LEN)
  ) {
    return "referralName must be a string";
  }

  if (!Array.isArray(b.platforms) || b.platforms.length === 0) {
    return "At least one platform is required";
  }
  const platforms: GameCode[] = [];
  for (const p of b.platforms) {
    if (!isGameCode(p)) return `Unknown platform code: ${String(p)}`;
    if (!platforms.includes(p)) platforms.push(p);
  }

  if (b.forceNew !== undefined && typeof b.forceNew !== "boolean") {
    return "forceNew must be a boolean";
  }

  return {
    facebookName: b.facebookName.trim(),
    facebookLink: b.facebookLink.trim(),
    referralName: (b.referralName as string | null | undefined)?.trim() || null,
    platforms,
    forceNew: b.forceNew === true,
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validate(body);
  if (typeof parsed === "string") {
    return NextResponse.json({ ok: false, error: parsed }, { status: 400 });
  }

  try {
    const result = await registerPlayer(parsed);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/register] Sheets sync failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
