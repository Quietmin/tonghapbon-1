import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Minimal shared-password gate for the public demo deployment (PRD assumes
 * intranet-only + no login for the real deployment; this is only meant to
 * keep the Vercel demo URL from being wide open to anyone who stumbles on it).
 * No DEMO_PASSWORD env var set -> no gate (local dev stays unaffected).
 */
export function middleware(request: NextRequest) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return NextResponse.next();

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const suppliedPassword = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";
    if (suppliedPassword === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse("인증이 필요합니다.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Plant Ops Manager Demo"' },
  });
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
