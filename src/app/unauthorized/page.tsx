"use client";

import { DeviceEnvWarningBanner } from "@/components/DeviceEnvWarningBanner";
import { diagnoseDeviceEnv, type DeviceEnvIssue } from "@/lib/device-client-env";
import { ShieldSlash } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import logo from "@/public/logo.png";

export default function UnauthorizedPage() {
  const reduceMotion = useReducedMotion();
  const [envIssue, setEnvIssue] = useState<DeviceEnvIssue | null>(null);

  useEffect(() => {
    setEnvIssue(diagnoseDeviceEnv());
  }, []);

  return (
    <main className="relative min-h-dvh bg-[#0B0B0B] text-[#E8E4DC]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% -8%, rgba(180,50,50,0.12), transparent 55%)",
        }}
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-10 flex items-center gap-3">
            <Image
              src={logo}
              alt="Kings Fortune Hub"
              width={44}
              height={44}
              priority
              className="h-11 w-11 object-contain"
            />
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#C45C56]">
                Access blocked
              </p>
              <h1 className="font-sans text-xl font-semibold tracking-tight text-[#F3EFE4]">
                Unauthorized device
              </h1>
            </div>
          </div>

          <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-md border border-[#5A2A2A] bg-[#1A1010] text-[#E8B4B0]">
            <ShieldSlash weight="bold" className="h-6 w-6" />
          </div>

          <p className="mb-4 max-w-[42ch] text-[15px] leading-relaxed text-[#C8C2B6]">
            This phone presented an invalid device-binding token. Middleware rejected the
            request and did not load the shop console or any API.
          </p>
          <p className="mb-6 max-w-[42ch] text-[14px] leading-relaxed text-[#8A857C]">
            A missing cookie is treated as first-time setup. A forged or corrupted
            <span className="font-mono text-[12px] text-[#C8C2B6]"> device_bound_token </span>
            is treated as a bypass attempt. The bad cookie has been cleared.
          </p>

          {envIssue ? <DeviceEnvWarningBanner issue={envIssue} className="mb-6" /> : null}

          <Link
            href="/verify-device"
            className="inline-flex h-12 items-center justify-center rounded-md bg-[#D4AF37] px-5 text-sm font-semibold text-[#14110A] transition-transform duration-150 hover:bg-[#E0C056] active:scale-[0.98]"
          >
            Authorize this phone
          </Link>

          <p className="mt-6 max-w-[42ch] font-mono text-[11px] leading-relaxed text-[#5C5852]">
            If DEVICE_TOKEN_SECRET was rotated in Vercel, every handset must re-bind. Fix the
            browser issue above first, then authorize again from the shop phone.
          </p>
        </motion.div>
      </div>
    </main>
  );
}
