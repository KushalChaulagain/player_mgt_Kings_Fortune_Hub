import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Unauthorized Device | Kings Fortune Hub",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function UnauthorizedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
