import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { authConfig } from "@/lib/auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = credentials.email as string
        const password = credentials.password as string

        const user = await db.user.findUnique({
          where: { email },
          include: { roles: { include: { role: true } } },
        })

        if (!user) return null

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          return null
        }

        // Check account status
        if (user.status !== 'ACTIVE') {
          return null
        }

        const passwordMatch = await bcrypt.compare(password, user.passwordHash)

        if (!passwordMatch) {
          // Increment failed login count and lock after 5 failed attempts (30 min)
          const newFailedCount = user.failedLogins + 1
          const updateData: { failedLogins: number; lockedUntil?: Date } = {
            failedLogins: newFailedCount,
          }

          if (newFailedCount >= 5) {
            updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000)
          }

          await db.user.update({
            where: { id: user.id },
            data: updateData,
          })
          return null
        }

        // Reset failed logins on success
        await db.user.update({
          where: { id: user.id },
          data: { failedLogins: 0, lockedUntil: null },
        })

        // Return user with roles so jwt callback (Edge-safe) can stuff them into the token
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles.map((ur) => ur.role.name),
          twoFactorRequired: user.twoFactor,
        }
      },
    }),
  ],
})
