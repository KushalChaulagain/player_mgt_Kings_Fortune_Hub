"use client";

import { DeviceEnvWarningBanner } from "@/components/DeviceEnvWarningBanner";
import { diagnoseDeviceEnv, type DeviceEnvIssue } from "@/lib/device-client-env";
import {
  CheckCircle,
  Fingerprint,
  LockKey,
  ShieldWarning,
  SpinnerGap,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import logo from "@/public/logo.png";

const LOCAL_STORAGE_KEY = "kfh_device_signature";

interface DeviceSignatureRecord {
  deviceId: string;
  credentialId: string;
  boundAt: string;
}

type Phase =
  | "idle"
  | "challenging"
  | "awaiting-gesture"
  | "binding"
  | "success"
  | "error";

interface PublicKeyOptions {
  challenge: number[];
  rp: { name: string; id: string };
  user: { id: number[]; name: string; displayName: string };
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  authenticatorSelection: {
    authenticatorAttachment: AuthenticatorAttachment;
    userVerification: UserVerificationRequirement;
    residentKey: ResidentKeyRequirement;
    requireResidentKey: boolean;
  };
  timeout: number;
  attestation: AttestationConveyancePreference;
}

interface ChallengeResponse {
  challengeToken: string;
  publicKey: PublicKeyOptions;
  error?: string;
}

interface BindResponse {
  ok?: boolean;
  deviceSignature?: DeviceSignatureRecord;
  error?: string;
}

interface SerializedCredential {
  id: string;
  rawId: string;
  type: string;
  authenticatorAttachment: string | null;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    authenticatorData?: string;
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toUint8Array(values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function serializeCredential(credential: PublicKeyCredential): SerializedCredential {
  const response = credential.response as AuthenticatorAttestationResponse;
  const payload: SerializedCredential = {
    id: credential.id,
    rawId: bytesToBase64Url(new Uint8Array(credential.rawId)),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? null,
    response: {
      clientDataJSON: bytesToBase64Url(new Uint8Array(response.clientDataJSON)),
      attestationObject: bytesToBase64Url(new Uint8Array(response.attestationObject)),
    },
  };

  if (typeof response.getAuthenticatorData === "function") {
    payload.response.authenticatorData = bytesToBase64Url(
      new Uint8Array(response.getAuthenticatorData())
    );
  }

  return payload;
}

function publicKeyFromOptions(options: PublicKeyOptions): PublicKeyCredentialCreationOptions {
  return {
    challenge: toUint8Array(options.challenge) as BufferSource,
    rp: options.rp,
    user: {
      id: toUint8Array(options.user.id) as BufferSource,
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams.map((p) => ({
      type: "public-key" as const,
      alg: p.alg,
    })),
    authenticatorSelection: options.authenticatorSelection,
    timeout: options.timeout,
    attestation: options.attestation,
  };
}

function describeWebAuthnError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Hardware check was cancelled or blocked. Tap below to retry Face ID, Touch ID, or PIN.";
    }
    if (error.name === "NotSupportedError") {
      return "This browser cannot create a platform passkey.";
    }
    if (error.name === "InvalidStateError") {
      return "This phone already has a passkey for this shop. Retry to bind it anyway.";
    }
    if (error.name === "SecurityError") {
      return "WebAuthn is blocked on this origin. Serve the app over HTTPS (or localhost).";
    }
    if (error.name === "AbortError") {
      return "Hardware check timed out. Retry from this phone.";
    }
    return error.message || error.name;
  }
  if (error instanceof Error) return error.message;
  return "Hardware authorization failed.";
}

function persistDeviceSignature(record: DeviceSignatureRecord) {
  const payload = {
    ...record,
    storedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
}

export default function VerifyDevicePage() {
  const reduceMotion = useReducedMotion();
  const [activationCode, setActivationCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ChallengeResponse | null>(null);
  const [envIssue, setEnvIssue] = useState<DeviceEnvIssue | null>(null);
  const pendingRef = useRef<ChallengeResponse | null>(null);

  useEffect(() => {
    setEnvIssue(diagnoseDeviceEnv());
  }, []);

  const envBlocked = envIssue !== null;

  const finishBind = useCallback(
    async (credential: PublicKeyCredential, challenge: ChallengeResponse) => {
      setPhase("binding");
      const res = await fetch("/api/device/bind", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeToken: challenge.challengeToken,
          credential: serializeCredential(credential),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as BindResponse;
      if (!res.ok || !data.ok || !data.deviceSignature) {
        throw new Error(data.error || "Could not issue a device token.");
      }
      persistDeviceSignature(data.deviceSignature);
      setPhase("success");
      window.setTimeout(() => {
        window.location.replace("/");
      }, 700);
    },
    []
  );

  const runHardwareCreate = useCallback(
    async (challenge: ChallengeResponse) => {
      let credential: Credential | null;
      try {
        credential = await navigator.credentials.create({
          publicKey: publicKeyFromOptions(challenge.publicKey),
        });
      } catch (err: unknown) {
        const webAuthnErr = err as { name?: string; message?: string; code?: number; stack?: string };
        console.error("=== WEBAUTHN HARDWARE ERROR DETAILED ===", {
          name: webAuthnErr.name,
          message: webAuthnErr.message,
          code: webAuthnErr.code,
          stack: webAuthnErr.stack,
        });
        setError(
          `WebAuthn Error [${webAuthnErr.name ?? "Unknown"}]: ${webAuthnErr.message ?? "No message"}. Code: ${webAuthnErr.code ?? "None"}`
        );
        throw err;
      }
      if (!credential || credential.type !== "public-key") {
        throw new Error("Authenticator returned an empty credential.");
      }
      await finishBind(credential as PublicKeyCredential, challenge);
    },
    [finishBind, setError]
  );

  async function requestChallenge(code: string): Promise<ChallengeResponse> {
    const res = await fetch("/api/device/challenge", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activationCode: code }),
    });
    const data = (await res.json().catch(() => ({}))) as ChallengeResponse;
    if (!res.ok || !data.challengeToken || !data.publicKey) {
      throw new Error(data.error || "Could not start the hardware challenge.");
    }
    return data;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (envBlocked) return;

    if (!/^\d{6}$/.test(activationCode)) {
      setError("Enter the current 6-digit activation code.");
      setPhase("error");
      return;
    }

    try {
      setPhase("challenging");
      const challenge = await requestChallenge(activationCode);
      pendingRef.current = challenge;
      setPending(challenge);
      await runHardwareCreate(challenge);
    } catch (err) {
      const needsGesture =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "AbortError");
      if (!(err instanceof DOMException)) {
        setError(describeWebAuthnError(err));
      }
      setPhase(needsGesture && pendingRef.current ? "awaiting-gesture" : "error");
    }
  }

  async function onRetryHardware() {
    if (envBlocked) return;

    const challenge = pendingRef.current ?? pending;
    if (!challenge) {
      setError("Challenge expired. Enter a fresh activation code.");
      setPhase("error");
      return;
    }
    setError(null);
    try {
      await runHardwareCreate(challenge);
    } catch (err) {
      if (!(err instanceof DOMException)) {
        setError(describeWebAuthnError(err));
      }
      setPhase("awaiting-gesture");
    }
  }

  const busy = phase === "challenging" || phase === "binding";
  const controlsDisabled = envBlocked || busy || phase === "success";
  const transition = reduceMotion ? { duration: 0 } : { duration: 0.45, ease: [0.16, 1, 0.3, 1] };

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-[#0B0B0B] px-5 py-10 text-[#E8E4DC] sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(212,175,55,0.08), transparent 55%)",
        }}
      />

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
        className="relative w-full max-w-sm"
      >
        <header className="mb-8 flex flex-col items-center text-center">
          <Image
            src={logo}
            alt="Kings Fortune Hub"
            width={48}
            height={48}
            priority
            className="mb-4 h-12 w-12 object-contain"
          />
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#D4AF37]">
            Kings Fortune Hub
          </p>
          <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-[#F3EFE4]">
            Secure Terminal Activation
          </h1>
        </header>

        <section className="rounded-xl border border-[#2A2A2A] bg-[#111111] p-6 sm:p-7">
          <form onSubmit={onSubmit} className="flex flex-col gap-5" autoComplete="off">
            {envIssue ? <DeviceEnvWarningBanner issue={envIssue} /> : null}

            <div className="flex flex-col gap-2">
              <label
                htmlFor="device-activation-code"
                className="text-[13px] font-medium text-[#D4C7A8]"
              >
                Activation code
              </label>
              <div className="relative">
                <LockKey
                  weight="bold"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6F6A62]"
                  aria-hidden
                />
                <input
                  id="device-activation-code"
                  name="device-activation-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={6}
                  pattern="\d{6}"
                  value={activationCode}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setActivationCode(digits);
                    if (phase === "error") {
                      setPhase("idle");
                      setError(null);
                    }
                  }}
                  disabled={controlsDisabled}
                  placeholder="Enter 6-digit activation code"
                  aria-disabled={controlsDisabled}
                  className="h-12 w-full rounded-md border border-[#2A2A2A] bg-[#141414] pl-10 pr-3 font-mono text-sm tracking-[0.2em] text-[#F3EFE4] outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-[#5C5852] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>

            <AnimatePresence mode="wait">
              {error ? (
                <motion.div
                  key={error}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex gap-2 rounded-md border border-[#5A2A2A] bg-[#1A1010] px-3 py-2.5 text-[13px] leading-relaxed text-[#E8B4B0]"
                  role="alert"
                >
                  <ShieldWarning weight="fill" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {phase === "awaiting-gesture" ? (
              <button
                type="button"
                onClick={onRetryHardware}
                disabled={envBlocked}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#D4AF37] px-4 text-sm font-semibold text-[#14110A] transition-transform duration-150 hover:bg-[#E0C056] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Fingerprint weight="bold" className="h-5 w-5" />
                Unlock with this phone
              </button>
            ) : (
              <button
                type="submit"
                disabled={controlsDisabled}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#D4AF37] px-4 text-sm font-semibold text-[#14110A] transition-transform duration-150 hover:bg-[#E0C056] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {phase === "success" ? (
                  <>
                    <CheckCircle weight="fill" className="h-5 w-5" />
                    Device bound
                  </>
                ) : busy ? (
                  <>
                    <SpinnerGap weight="bold" className="h-5 w-5 animate-spin" />
                    {phase === "binding" ? "Saving device token" : "Verifying activation code"}
                  </>
                ) : (
                  <>
                    <Fingerprint weight="bold" className="h-5 w-5" />
                    Authorize this phone
                  </>
                )}
              </button>
            )}
          </form>
        </section>
      </motion.div>
    </main>
  );
}
