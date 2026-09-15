import { NextResponse } from "next/server";
import {
  appendRegistration,
  type RegistrationPayload,
} from "@/lib/sheets";

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

  if (!Array.isArray(b.accounts) || b.accounts.length === 0) {
    return "At least one account is required";
  }

  const accounts: RegistrationPayload["accounts"] = [];
  for (const a of b.accounts) {
    if (!a || typeof a !== "object") return "Invalid account entry";
    const acc = a as Record<string, unknown>;
    if (
      !isNonEmptyString(acc.platform) ||
      !isNonEmptyString(acc.code, 10) ||
      !isNonEmptyString(acc.generatedID)
    ) {
      return "Each account needs platform, code and generatedID";
    }
    accounts.push({
      platform: acc.platform,
      code: acc.code,
      generatedID: acc.generatedID,
    });
  }

  return {
    facebookName: b.facebookName,
    facebookLink: b.facebookLink,
    referralName: (b.referralName as string | null | undefined) ?? null,
    accounts,
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
    const result = await appendRegistration(parsed);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/register] Sheets sync failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
