import type { DeviceEnvIssue } from "@/lib/device-client-env";
import { WarningCircle } from "@phosphor-icons/react";

interface DeviceEnvWarningBannerProps {
  issue: DeviceEnvIssue;
  className?: string;
}

export function DeviceEnvWarningBanner({ issue, className = "" }: DeviceEnvWarningBannerProps) {
  return (
    <div
      role="alert"
      className={`flex gap-2.5 rounded-md border border-[#5A4A2A] bg-[#1A1710] px-3.5 py-3 text-[13px] leading-relaxed text-[#E8D4A8] ${className}`.trim()}
    >
      <WarningCircle weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]" />
      <p className="font-medium leading-snug text-[#F3E6C4]">
        {issue.title}
        {issue.message ? (
          <span className="mt-1 block font-normal text-[#C8B896]">{issue.message}</span>
        ) : null}
      </p>
    </div>
  );
}
