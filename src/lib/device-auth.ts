/**
 * Edge-safe device-binding crypto.
 * HMAC-SHA256 tokens via Web Crypto only. No Node builtins.
 */

export const COOKIE_NAME = "device_bound_token";
export const LOCAL_STORAGE_KEY = "kfh_device_signature";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10 years
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const RP_NAME = "Kings Fortune Hub";

export interface DeviceTokenPayload {
  v: 1;
  sub: "kfh-device";
  deviceId: string;
  credentialId: string;
  iat: number;
  exp: number;
}

export interface ChallengePayload {
  v: 1;
  purpose: "webauthn-create";
  challenge: string;
  rpId: string;
  origin: string;
  userId: string;
  totpCounter: number;
  exp: number;
}

export interface DeviceSignatureRecord {
  deviceId: string;
  credentialId: string;
  boundAt: string;
}

export type CookieVerifyResult =
  | { status: "valid"; payload: DeviceTokenPayload }
  | { status: "missing" }
  | { status: "expired" }
  | { status: "invalid" };

export function deviceCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const bin = atob(normalized + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function normalizeB64Url(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return new Uint8Array(digest);
}

export async function secretsMatch(left: string, right: string): Promise<boolean> {
  const enc = new TextEncoder();
  const a = await sha256Bytes(enc.encode(left));
  const b = await sha256Bytes(enc.encode(right));
  return timingSafeEqualBytes(a, b);
}

function getSigningSecret(): string {
  return process.env.DEVICE_TOKEN_SECRET?.trim() ?? "";
}

async function hmacKey(usage: KeyUsage[]): Promise<CryptoKey> {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error("DEVICE_TOKEN_SECRET is not configured");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage
  );
}

async function signPayload(encoded: string): Promise<string> {
  const key = await hmacKey(["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  return bytesToBase64Url(new Uint8Array(sig));
}

async function verifyPayloadSignature(encoded: string, signature: string): Promise<boolean> {
  let expected: string;
  try {
    expected = await signPayload(encoded);
  } catch {
    return false;
  }
  return timingSafeEqualBytes(base64UrlToBytes(signature), base64UrlToBytes(expected));
}

function splitToken(token: string): { encoded: string; signature: string } | null {
  const idx = token.lastIndexOf(".");
  if (idx <= 0 || idx === token.length - 1) return null;
  return { encoded: token.slice(0, idx), signature: token.slice(idx + 1) };
}

export async function signDeviceToken(payload: DeviceTokenPayload): Promise<string> {
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signPayload(encoded);
  return `${encoded}.${signature}`;
}

export async function signChallengeToken(payload: ChallengePayload): Promise<string> {
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signPayload(encoded);
  return `${encoded}.${signature}`;
}

export async function verifyChallengeToken(token: string): Promise<ChallengePayload | null> {
  const parts = splitToken(token);
  if (!parts) return null;
  if (!(await verifyPayloadSignature(parts.encoded, parts.signature))) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts.encoded))) as ChallengePayload;
    if (json.v !== 1 || json.purpose !== "webauthn-create") return null;
    if (typeof json.challenge !== "string" || typeof json.rpId !== "string") return null;
    if (typeof json.origin !== "string" || typeof json.userId !== "string") return null;
    if (typeof json.exp !== "number" || Date.now() > json.exp) return null;
    if (typeof json.totpCounter !== "number" || !Number.isFinite(json.totpCounter)) return null;
    return json;
  } catch {
    return null;
  }
}

export async function verifyDeviceBoundCookie(
  cookieValue: string | undefined | null
): Promise<CookieVerifyResult> {
  if (!cookieValue) return { status: "missing" };
  const parts = splitToken(cookieValue);
  if (!parts) return { status: "invalid" };
  if (!(await verifyPayloadSignature(parts.encoded, parts.signature))) {
    return { status: "invalid" };
  }
  try {
    const json = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(parts.encoded))
    ) as DeviceTokenPayload;
    if (json.v !== 1 || json.sub !== "kfh-device") return { status: "invalid" };
    if (typeof json.deviceId !== "string" || typeof json.credentialId !== "string") {
      return { status: "invalid" };
    }
    if (typeof json.iat !== "number" || typeof json.exp !== "number") {
      return { status: "invalid" };
    }
    if (Date.now() / 1000 > json.exp) return { status: "expired" };
    return { status: "valid", payload: json };
  } catch {
    return { status: "invalid" };
  }
}

export function hostWithoutPort(hostHeader: string): string {
  const trimmed = hostHeader.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end >= 0 ? trimmed.slice(0, end + 1) : trimmed;
  }
  return trimmed.split(":")[0] ?? trimmed;
}

/** Strip protocol, path, and port; return a bare hostname for WebAuthn rpId. */
export function normalizeHostname(raw: string): string {
  let value = raw.trim();
  if (!value) return "localhost";
  value = value.replace(/^https?:\/\//i, "");
  const slash = value.indexOf("/");
  if (slash >= 0) value = value.slice(0, slash);
  return hostWithoutPort(value.toLowerCase()) || "localhost";
}

type RequestWithNextUrl = Request & {
  nextUrl?: { hostname?: string; origin?: string };
};

function hostnameFromOriginHeader(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    return normalizeHostname(new URL(origin).hostname);
  } catch {
    return null;
  }
}

function hostnameFromNextUrl(request: Request): string | null {
  const nextUrl = (request as RequestWithNextUrl).nextUrl;
  if (!nextUrl?.hostname) return null;
  return normalizeHostname(nextUrl.hostname);
}

function rawHostFromHeaders(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = forwarded ?? request.headers.get("host") ?? "localhost";
  let value = (host.split(",")[0] ?? host).trim();
  value = value.replace(/^https?:\/\//i, "");
  const slash = value.indexOf("/");
  if (slash >= 0) value = value.slice(0, slash);
  return value.toLowerCase() || "localhost";
}

function hostnameFromHostHeaders(request: Request): string {
  return hostWithoutPort(rawHostFromHeaders(request));
}

/** Effective hostname for rpId — aligned with the browser origin when possible. */
export function hostnameFromRequest(request: Request): string {
  return (
    hostnameFromOriginHeader(request) ??
    hostnameFromNextUrl(request) ??
    hostnameFromHostHeaders(request)
  );
}

export function rpIdFromRequest(request: Request): string {
  return hostnameFromRequest(request);
}

export function originFromRequest(request: Request): string {
  const originHeader = request.headers.get("origin");
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      return originHeader.replace(/\/$/, "");
    }
  }

  const nextUrl = (request as RequestWithNextUrl).nextUrl;
  if (nextUrl?.origin) return nextUrl.origin;

  const authority = rawHostFromHeaders(request);
  const hostname = hostWithoutPort(authority);
  const protoHeader = request.headers.get("x-forwarded-proto");
  const proto =
    protoHeader?.split(",")[0]?.trim() ??
    (hostname === "localhost" || hostname.startsWith("127.") ? "http" : "https");
  return `${proto}://${authority}`;
}

export interface ClientDataJSON {
  type: string;
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
}

export function parseClientDataJSON(clientDataJSONB64: string): ClientDataJSON | null {
  try {
    const json = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(clientDataJSONB64))
    ) as ClientDataJSON;
    if (typeof json.type !== "string") return null;
    if (typeof json.challenge !== "string") return null;
    if (typeof json.origin !== "string") return null;
    return json;
  } catch {
    return null;
  }
}

export function readAuthenticatorFlags(authData: Uint8Array): {
  userPresent: boolean;
  userVerified: boolean;
  attestedCredentialData: boolean;
} | null {
  if (authData.length < 37) return null;
  const flags = authData[32];
  return {
    userPresent: (flags & 0x01) !== 0,
    userVerified: (flags & 0x04) !== 0,
    attestedCredentialData: (flags & 0x40) !== 0,
  };
}

export function extractAuthDataFromAttestationObject(
  attestationObject: Uint8Array
): Uint8Array | null {
  const key = new TextEncoder().encode("authData");
  outer: for (let i = 1; i <= attestationObject.length - key.length; i++) {
    for (let j = 0; j < key.length; j++) {
      if (attestationObject[i + j] !== key[j]) continue outer;
    }
    if (attestationObject[i - 1] !== 0x68) continue;
    let p = i + key.length;
    if (p >= attestationObject.length) return null;
    const head = attestationObject[p];
    const major = head >> 5;
    const addl = head & 0x1f;
    if (major !== 2) return null;
    p += 1;
    let len = 0;
    if (addl < 24) {
      len = addl;
    } else if (addl === 24) {
      if (p >= attestationObject.length) return null;
      len = attestationObject[p];
      p += 1;
    } else if (addl === 25) {
      if (p + 1 >= attestationObject.length) return null;
      len = (attestationObject[p] << 8) | attestationObject[p + 1];
      p += 2;
    } else if (addl === 26) {
      if (p + 3 >= attestationObject.length) return null;
      len =
        (attestationObject[p] << 24) |
        (attestationObject[p + 1] << 16) |
        (attestationObject[p + 2] << 8) |
        attestationObject[p + 3];
      p += 4;
    } else {
      return null;
    }
    if (len < 37 || p + len > attestationObject.length) return null;
    return attestationObject.slice(p, p + len);
  }
  return null;
}

export function originsMatch(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.origin === b.origin;
  } catch {
    return left.replace(/\/$/, "") === right.replace(/\/$/, "");
  }
}
