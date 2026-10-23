import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Back to the host the browser used. Next's request.url and nextUrl carry the dev server's own bind address
// (localhost / 127.0.0.1), which sends anyone on the LAN to their own machine and loses their cookies.
const to = (request: NextRequest, pathname: string) => {
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return new URL(pathname, host ? `${proto}://${host}` : request.url);
};

// Runs on the edge, so it trusts the account claims in the session token; API routes re-check the database
export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const path = request.nextUrl.pathname;
  const isAdminPage = path.startsWith("/admin");
  const gated = isAdminPage || path === "/" || path === "/api/questions" || path === "/account"
    || ["/exam", "/leaderboard", "/history", "/data"].some(p => path.startsWith(p));
  if (!gated) {
    return NextResponse.next();
  }

  // No account in the token: signed out, or a session from before accounts existed
  if (!token?.uid) {
    const signIn = to(request, "/signin");
    signIn.searchParams.set("callbackUrl", path + request.nextUrl.search);
    return NextResponse.redirect(signIn);
  }

  // Someone signed in with a temporary password picks their own before anything else
  if (token.mustChangePassword && path !== "/account" && !path.startsWith("/api/")) {
    return NextResponse.redirect(to(request, "/account"));
  }

  if (path.startsWith("/leaderboard") && token.canSeeLeaderboard === false) {
    return NextResponse.redirect(to(request, "/"));
  }

  if (isAdminPage && !token.isAdmin) {
    return NextResponse.redirect(to(request, "/"));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/exam/:path*", "/leaderboard/:path*", "/history/:path*", "/data/:path*", "/account", "/admin/:path*", "/api/:path*"],
};
