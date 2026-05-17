import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

/**
 * Get the current session in server components / server actions.
 * Returns null if not authenticated.
 */
export async function getServerSession() {
  const session = await auth()
  return session
}

/**
 * Require authentication — redirects to /login if not authenticated.
 * Use in server components or server actions that require a logged-in user.
 *
 * @returns The authenticated session (never null)
 */
export async function requireAuth() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  return session
}

/**
 * Require a specific role — redirects to /login if not authenticated,
 * throws an error if the user doesn't have the required role.
 *
 * @param role - The role name to check (e.g., "System_Admin", "Director")
 * @returns The authenticated session with the verified role
 */
export async function requireRole(role: string) {
  const session = await requireAuth()

  if (!session.user.roles?.includes(role)) {
    throw new Error(`Bạn không có quyền truy cập. Yêu cầu vai trò: ${role}`)
  }

  return session
}

/**
 * Check if the current user has any of the specified roles.
 * Does not throw — returns boolean. Useful for conditional rendering.
 *
 * @param roles - Array of role names to check
 * @returns true if user has at least one of the specified roles
 */
export async function hasAnyRole(roles: string[]) {
  const session = await auth()

  if (!session?.user?.roles) return false

  return roles.some((role) => session.user.roles.includes(role))
}
