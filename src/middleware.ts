import {
  COOKIE_NAME,
  verifyDeviceBoundCookie,
} from "@/lib/device-auth";
import { NextRequest, NextResponse } from "next/server";

function isDeviceHandshakeApi(pathname: string): boolean {
  return pathname === "/api/device" || pathname.startsWith("/api/device/");
}

function isDocumentNavigation(request: NextRequest): boolean {
  const dest = request.headers.get("sec-fetch-dest");
  const mode = request.headers.get("sec-fetch-mode");
  if (dest === "document" || mode === "navigate") return true;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html") && !accept.includes("application/json");
}

function jsonDenied(blocked: boolean, redirect: string) {
  return NextResponse.json(
    {
      error: blocked
        ? "Unauthorized device. The binding token is invalid."
        : "This device is not bound. Complete hardware authorization first.",
      code: blocked ? "DEVICE_TOKEN_INVALID" : "DEVICE_NOT_BOUND",
      redirect,
    },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isDeviceHandshakeApi(pathname)) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const result = await verifyDeviceBoundCookie(cookie);

  if (result.status === "valid") {
    return NextResponse.next();
  }

  const blocked = result.status === "invalid";
  const destPath = blocked ? "/unauthorized" : "/verify-device";
  const isApi = pathname.startsWith("/api/");

  if (isApi && !isDocumentNavigation(request)) {
    return jsonDenied(blocked, destPath);
  }

  const url = request.nextUrl.clone();
  url.pathname = destPath;
  url.search = "";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-device-gate", blocked ? "invalid" : "missing");

  const response = NextResponse.rewrite(url, {
    request: { headers: requestHeaders },
  });
  response.headers.set("Cache-Control", "no-store");

  if (blocked || result.status === "expired") {
    response.cookies.set({
      name: COOKIE_NAME,
      value: "",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}

export const config = {
  matcher: ["/", "/api/:path*"],
};
