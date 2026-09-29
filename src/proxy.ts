import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Next.js 16 proxy (formerly middleware). Performs the optimistic auth check
 * from `authConfig.callbacks.authorized`. Real authorization happens again in
 * every Server Action / Route Handler via `requireActor()`.
 */
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/campaigns/:path*",
    "/api/versions/:path*",
    "/api/questions/:path*",
    "/api/exports/:path*",
    "/api/ai/:path*",
  ],
};
