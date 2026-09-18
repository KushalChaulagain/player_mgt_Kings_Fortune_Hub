import {
  CHALLENGE_TTL_MS,
  RP_NAME,
  bytesToBase64Url,
  originFromRequest,
  randomBytes,
  rpIdFromRequest,
  setupKeyMatches,
  signChallengeToken,
  type ChallengePayload,
} from "@/lib/device-auth";
import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface ChallengeBody {
  setupKey?: unknown;
}

export async function POST(request: Request) {
  let body: ChallengeBody;
  try {
    body = (await request.json()) as ChallengeBody;
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const setupKey = typeof body.setupKey === "string" ? body.setupKey : "";
  const matched = await setupKeyMatches(setupKey);
  if (!matched) {
    return NextResponse.json(
      { error: "Master setup key is incorrect." },
      { status: 401 }
    );
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
    exp: Date.now() + CHALLENGE_TTL_MS,
  };

  const challengeToken = await signChallengeToken(payload);

  return NextResponse.json(
    {
      challengeToken,
      publicKey: {
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
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required",
          requireResidentKey: true,
        },
        timeout: 120000,
        attestation: "none",
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
}
