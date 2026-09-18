import {
  COOKIE_NAME,
  COOKIE_MAX_AGE,
  base64UrlToBytes,
  bytesToHex,
  deviceCookieOptions,
  extractAuthDataFromAttestationObject,
  normalizeB64Url,
  originFromRequest,
  originsMatch,
  parseClientDataJSON,
  randomBytes,
  readAuthenticatorFlags,
  rpIdFromRequest,
  signDeviceToken,
  verifyChallengeToken,
  type DeviceSignatureRecord,
  type DeviceTokenPayload,
} from "@/lib/device-auth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface BindBody {
  challengeToken?: unknown;
  credential?: {
    id?: unknown;
    rawId?: unknown;
    type?: unknown;
    response?: {
      clientDataJSON?: unknown;
      attestationObject?: unknown;
      authenticatorData?: unknown;
    };
  };
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function POST(request: NextRequest) {
  let body: BindBody;
  try {
    body = (await request.json()) as BindBody;
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const challengeToken = asNonEmptyString(body.challengeToken);
  if (!challengeToken) {
    return NextResponse.json({ error: "Missing challenge token." }, { status: 400 });
  }

  const challenge = await verifyChallengeToken(challengeToken);
  if (!challenge) {
    return NextResponse.json(
      { error: "Hardware challenge expired or was tampered with. Retry authorization." },
      { status: 401 }
    );
  }

  const expectedOrigin = originFromRequest(request);
  const expectedRpId = rpIdFromRequest(request);
  if (challenge.rpId !== expectedRpId || !originsMatch(challenge.origin, expectedOrigin)) {
    return NextResponse.json(
      { error: "Challenge was issued for a different origin." },
      { status: 401 }
    );
  }

  const cred = body.credential;
  const credentialId = asNonEmptyString(cred?.id) ?? asNonEmptyString(cred?.rawId);
  const clientDataB64 = asNonEmptyString(cred?.response?.clientDataJSON);
  if (!credentialId || !clientDataB64 || cred?.type !== "public-key") {
    return NextResponse.json(
      { error: "Malformed authenticator response." },
      { status: 400 }
    );
  }

  const clientData = parseClientDataJSON(clientDataB64);
  if (!clientData) {
    return NextResponse.json({ error: "Invalid clientDataJSON." }, { status: 400 });
  }
  if (clientData.type !== "webauthn.create") {
    return NextResponse.json(
      { error: "Unexpected WebAuthn ceremony type." },
      { status: 400 }
    );
  }
  if (normalizeB64Url(clientData.challenge) !== normalizeB64Url(challenge.challenge)) {
    return NextResponse.json({ error: "Challenge mismatch." }, { status: 401 });
  }
  if (!originsMatch(clientData.origin, expectedOrigin)) {
    return NextResponse.json({ error: "Origin mismatch." }, { status: 401 });
  }

  let authData: Uint8Array | null = null;
  const authDataB64 = asNonEmptyString(cred?.response?.authenticatorData);
  if (authDataB64) {
    try {
      authData = base64UrlToBytes(authDataB64);
    } catch {
      authData = null;
    }
  }
  if (!authData) {
    const attB64 = asNonEmptyString(cred?.response?.attestationObject);
    if (attB64) {
      try {
        authData = extractAuthDataFromAttestationObject(base64UrlToBytes(attB64));
      } catch {
        authData = null;
      }
    }
  }
  if (!authData) {
    return NextResponse.json(
      { error: "Could not read authenticator data from this device." },
      { status: 400 }
    );
  }

  const flags = readAuthenticatorFlags(authData);
  if (!flags || !flags.userPresent || !flags.userVerified) {
    return NextResponse.json(
      { error: "Hardware user verification failed. Use Face ID, Touch ID, or the device PIN." },
      { status: 401 }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: DeviceTokenPayload = {
    v: 1,
    sub: "kfh-device",
    deviceId: bytesToHex(randomBytes(32)),
    credentialId,
    iat: now,
    exp: now + COOKIE_MAX_AGE,
  };

  const token = await signDeviceToken(payload);
  const record: DeviceSignatureRecord = {
    deviceId: payload.deviceId,
    credentialId: payload.credentialId,
    boundAt: new Date(payload.iat * 1000).toISOString(),
  };

  const response = NextResponse.json(
    { ok: true as const, deviceSignature: record },
    { headers: { "Cache-Control": "no-store" } }
  );
  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    ...deviceCookieOptions(),
  });
  return response;
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
}
