import {
  CHALLENGE_TTL_MS,
  RP_NAME,
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

  const publicKey = {
    challenge: Array.from(challenge),
    rp: {
      name: RP_NAME,
      id: rpId,
    },
    user: {
      id: Array.from(userId),
      name: "shop-admin-device",
      displayName: "Shop Admin Device",
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform" as const,
      userVerification: "required" as const,
      residentKey: "required" as const,
      requireResidentKey: true,
    },
    timeout: 120000,
    attestation: "none" as const,
  };

  console.log("=== SERVER WEBAUTHN OPTIONS ===", {
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    rpId: publicKey.rp.id,
    userVerification: publicKey.authenticatorSelection.userVerification,
    residentKey: publicKey.authenticatorSelection.residentKey,
  });

  return NextResponse.json(
    { challengeToken, publicKey },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
}
