/**
 * Edge-safe RFC 6238 TOTP via Web Crypto (HMAC-SHA1).
 * Codes rotate every 30 seconds; each verified code is single-use.
 */

export const TOTP_PERIOD_SEC = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;

export type TotpVerifyResult =
  | { ok: true; counter: number }
  | { ok: false; reason: "invalid" | "spent" | "unconfigured" };

const spentCodes = new Map<string, number>();

function cleanupSpent(now = Date.now()): void {
  for (const [key, expiresAt] of spentCodes) {
    if (expiresAt <= now) spentCodes.delete(key);
  }
}

function spentKey(counter: number, code: string): string {
  return `${counter}:${code}`;
}

function isSpent(counter: number, code: string): boolean {
  cleanupSpent();
  return spentCodes.has(spentKey(counter, code));
}

function markSpent(counter: number, code: string): void {
  const ttlMs = (TOTP_PERIOD_SEC * (TOTP_WINDOW + 1) + 15) * 1000;
  spentCodes.set(spentKey(counter, code), Date.now() + ttlMs);
  cleanupSpent();
}

function counterForTime(unixMs: number = Date.now()): number {
  return Math.floor(unixMs / 1000 / TOTP_PERIOD_SEC);
}

function counterToBytes(counter: number): Uint8Array {
  const buf = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  return buf;
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, message as BufferSource);
  return new Uint8Array(sig);
}

async function generateTotpForCounter(secret: string, counter: number): Promise<string> {
  const key = new TextEncoder().encode(secret);
  const hmac = await hmacSha1(key, counterToBytes(counter));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 10 ** TOTP_DIGITS;
  return otp.toString().padStart(TOTP_DIGITS, "0");
}

export function getTotpMasterSeed(): string {
  return process.env.TOTP_MASTER_SEED?.trim() ?? "";
}

export function isValidActivationCodeFormat(input: string): boolean {
  return /^\d{6}$/.test(input);
}

export async function verifyAndConsumeTotp(input: string): Promise<TotpVerifyResult> {
  const seed = getTotpMasterSeed();
  const code = input.trim();

  if (!seed) {
    await hmacSha1(new TextEncoder().encode("totp-unconfigured"), counterToBytes(0));
    return { ok: false, reason: "unconfigured" };
  }

  if (!isValidActivationCodeFormat(code)) {
    return { ok: false, reason: "invalid" };
  }

  const baseCounter = counterForTime();
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const counter = baseCounter + delta;
    if (isSpent(counter, code)) {
      return { ok: false, reason: "spent" };
    }
  }

  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const counter = baseCounter + delta;
    const expected = await generateTotpForCounter(seed, counter);
    if (expected === code) {
      if (isSpent(counter, code)) {
        return { ok: false, reason: "spent" };
      }
      markSpent(counter, code);
      return { ok: true, counter };
    }
  }

  return { ok: false, reason: "invalid" };
}

/** Dev/admin helper: current activation code for the active 30-second window. */
export async function currentTotpCode(now = Date.now()): Promise<string | null> {
  const seed = getTotpMasterSeed();
  if (!seed) return null;
  return generateTotpForCounter(seed, counterForTime(now));
}
