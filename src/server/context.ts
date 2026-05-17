import { db } from "@/lib/db"
import { auth } from "@/lib/auth"

/**
 * Creates the tRPC context for each request.
 * Includes the authenticated session from NextAuth v5.
 */
export async function createTRPCContext(opts?: { headers?: Headers }) {
  const session = await auth()

  return {
    db,
    session: session
      ? {
          user: {
            id: session.user.id,
            email: session.user.email ?? "",
            name: session.user.name ?? "",
          },
          roles: session.user.roles ?? [],
        }
      : null,
    headers: opts?.headers,
  }
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>
