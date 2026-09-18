import {
  CHALLENGE_TTL_MS,
  buildWebAuthnRegistrationFallbackOptions,
  buildWebAuthnRegistrationOptions,
  bytesToBase64Url,
  originFromRequest,
  randomBytes,
  rpIdFromRequest,
  signChallengeToken,
  type ChallengePayload,
} from "@/lib/device-auth";
import { verifyAndConsumeTotp } from "@/lib/totp";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface ChallengeBody {
  activationCode?: unknown;
  /** @deprecated Use activationCode */
  setupKey?: unknown;
}

export async function POST(request: NextRequest) {
  let body: ChallengeBody;
  try {
    body = (await request.json()) as ChallengeBody;
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const activationCode =
    typeof body.activationCode === "string"
      ? body.activationCode
      : typeof body.setupKey === "string"
        ? body.setupKey
        : "";
  const totp = await verifyAndConsumeTotp(activationCode);
  if (!totp.ok) {
    const message =
      totp.reason === "spent"
        ? "This activation code was already used. Wait for the next 30-second code."
        : totp.reason === "unconfigured"
          ? "Device activation is not configured on the server."
          : "Activation code is incorrect or expired.";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const rpId = rpIdFromRequest(request);
  const origin = originFromRequest(request);
  const challenge = randomBytes(32);
  const userId = randomBytes(32);

  const payload: ChallengePayload = {
    v: 1,
    purpose: "webauthn-create",
    challenge: bytesToBase64Url(challenge),
    rpId,
    origin,
    userId: bytesToBase64Url(userId),
    totpCounter: totp.counter,
    exp: Date.now() + CHALLENGE_TTL_MS,
  };

  const challengeToken = await signChallengeToken(payload);

  const publicKey = buildWebAuthnRegistrationOptions({ rpId, challenge, userId });
  const publicKeyFallback = buildWebAuthnRegistrationFallbackOptions({
    rpId,
    challenge,
    userId,
  });

  console.log("=== SERVER WEBAUTHN OPTIONS ===", {
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    rpId: publicKey.rp.id,
    excludeCredentials: publicKey.excludeCredentials,
    userVerification: publicKey.authenticatorSelection.userVerification,
    residentKey: publicKey.authenticatorSelection.residentKey,
    requireResidentKey: publicKey.authenticatorSelection.requireResidentKey,
    fallbackResidentKey: publicKeyFallback.authenticatorSelection.residentKey,
  });

  return NextResponse.json(
    { challengeToken, publicKey, publicKeyFallback },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
}
