import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ALLOWED_USERS = ["Superallyman", "Ryan Jobe", "username3"];

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Get the pathname of the request
  const path = request.nextUrl.pathname;

  // Allow all non-homepage requests
  if (path !== "/" && path !== "/api/questions") {
    return NextResponse.next();
  }

  // If no token, redirect to sign-in
  if (!token) {
    return NextResponse.redirect(new URL("/api/auth/signin", request.url));
  }

  // Ensure token contains user data
  const username = token.name || token.login; // Adjust based on your session structure

  if (!ALLOWED_USERS.includes(username as string)) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return NextResponse.next();
}

// Configure on which paths to run the middleware
export const config = {
  matcher: ["/", "/api/:path*"],
};
