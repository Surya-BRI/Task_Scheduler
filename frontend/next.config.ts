import type { NextConfig } from "next";
import path from "path";

const monorepoRoot = path.resolve(__dirname, "..");

function resolveApiOrigin(): string {
  const apiBase =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:7000/api/v1"
      : "https://task-scheduler.app-brisigns.com/api/v1");
  return apiBase.replace(/\/api\/v1\/?$/, "");
}

function buildContentSecurityPolicy(isProd: boolean, apiOrigin: string): string {
  const connectSources = ["'self'", apiOrigin, "ws:", "wss:"];
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return directives.join("; ");
}

const isProd = process.env.NODE_ENV === "production";
const apiOrigin = resolveApiOrigin();

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Content-Security-Policy",
        value: buildContentSecurityPolicy(isProd, apiOrigin),
      },
    ];

    if (isProd) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
