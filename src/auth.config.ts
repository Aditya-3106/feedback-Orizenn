import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration shared by `proxy.ts` and `auth.ts`.
 * No database access here; the Credentials provider lives in `auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12 hours
  },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isProtected =
        pathname.startsWith("/admin") ||
        pathname.startsWith("/api/campaigns") ||
        pathname.startsWith("/api/versions") ||
        pathname.startsWith("/api/questions") ||
        pathname.startsWith("/api/exports") ||
        pathname.startsWith("/api/ai");
      if (!isProtected) return true;
      if (auth?.user) return true;
      if (pathname.startsWith("/api/")) {
        return Response.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "You need to sign in." } },
          { status: 401 },
        );
      }
      const login = new URL("/login", request.nextUrl);
      login.searchParams.set("next", pathname);
      return Response.redirect(login);
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.workspaceId = user.workspaceId;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.role = token.role;
      session.user.workspaceId = token.workspaceId;
      return session;
    },
  },
} satisfies NextAuthConfig;
