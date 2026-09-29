import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/db/client";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        try {
          const parsed = credentialsSchema.safeParse(raw);
          if (!parsed.success) {
            console.error("[auth] credentials schema failed:", parsed.error.issues);
            return null;
          }
          const { email, password } = parsed.data;

          console.log("[auth] attempting login for:", email);

          const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true, name: true, email: true, role: true, workspaceId: true, passwordHash: true },
          });

          if (!user) {
            console.error("[auth] no user found for email:", email);
            return null;
          }

          const valid = await compare(password, user.passwordHash);
          if (!valid) {
            console.error("[auth] password mismatch for:", email);
            return null;
          }

          console.log("[auth] login success for:", email);
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            workspaceId: user.workspaceId,
          };
        } catch (err) {
          console.error("[auth] authorize threw an error:", err);
          return null;
        }
      },
    }),
  ],
});
