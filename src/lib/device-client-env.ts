export type DeviceEnvIssueCode =
  | "insecure-context"
  | "no-webauthn"
  | "edge-legacy"
  | "desktop-browser";

export interface DeviceEnvIssue {
  code: DeviceEnvIssueCode;
  title: string;
  message: string;
}

function isEdgeBrowser(): boolean {
  return /Edg\//.test(navigator.userAgent);
}

function isMobileHandset(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function diagnoseDeviceEnv(): DeviceEnvIssue | null {
  if (typeof window === "undefined") return null;

  if (!window.isSecureContext) {
    return {
      code: "insecure-context",
      title: "HTTPS required",
      message:
        "WebAuthn only runs in a secure context. Open the shop console on your production https:// domain or http://localhost during local testing.",
    };
  }

  const webauthnReady =
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function";

  if (!webauthnReady) {
    if (isEdgeBrowser()) {
      return {
        code: "edge-legacy",
        title: "Edge cannot complete binding",
        message:
          "Some Edge builds block platform passkey creation for this ceremony. Switch to Safari on iOS or Chrome on Android, then tap Authorize this phone again.",
      };
    }

    return {
      code: "no-webauthn",
      title: "WebAuthn unavailable",
      message:
        "This browser cannot invoke platform biometrics. Use Safari or Chrome on the authorized shop phone.",
    };
  }

  if (!isMobileHandset()) {
    return {
      code: "desktop-browser",
      title: "Phone hardware required",
      message:
        "Device binding is locked to platform secure enclave chips on a physical handset. Open this page on the shop phone, not a desktop browser.",
    };
  }

  return null;
}
