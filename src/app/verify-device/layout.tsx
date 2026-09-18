import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Authorize Device | Kings Fortune Hub",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function VerifyDeviceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
