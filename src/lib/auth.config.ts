import type { NextAuthConfig } from "next-auth"

/**
 * Edge-safe NextAuth config (no Prisma, no bcrypt).
 * Used by middleware. Full config (with Credentials provider that calls DB)
 * lives in auth.ts and runs in the Node.js runtime via the auth handlers.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [], // Real providers added in auth.ts
  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in, copy user fields into the token.
      // Edge-safe: no DB calls here.
      if (user) {
        token.id = (user as { id?: string }).id
        token.email = user.email
        token.name = user.name
        token.roles = (user as { roles?: string[] }).roles ?? []
        token.twoFactorRequired = (user as { twoFactorRequired?: boolean }).twoFactorRequired ?? false
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.roles = (token.roles as string[]) || []
        session.user.twoFactorRequired = (token.twoFactorRequired as boolean) || false
      }
      return session
    },
  },
} satisfies NextAuthConfig
