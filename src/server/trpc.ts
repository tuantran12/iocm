import { initTRPC, TRPCError } from '@trpc/server'
import { type TRPCContext } from './context'
import { checkRole, checkScope, type UserRoleWithScope } from './rbac'
import { SKIP_PATHS, createAuditEntry } from './middleware/audit'

/**
 * tRPC v11 initialization for IOCM.
 * Uses default transformer (superjson not needed with tRPC v11 defaults).
 */
const t = initTRPC.context<TRPCContext>().create()

/**
 * Router factory — used to create tRPC routers.
 */
export const router = t.router

/**
 * Public procedure — no auth required.
 */
export const publicProcedure = t.procedure

/**
 * Protected procedure — requires authenticated session.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Bạn cần đăng nhập' })
  }
  return next({ ctx: { ...ctx, session: ctx.session } })
})

/**
 * Middleware creator — for custom middleware chains.
 */
export const middleware = t.middleware

/**
 * Role-protected procedure factory.
 * Creates a procedure that requires the user to have at least one of the specified roles.
 * System_Admin bypasses all role checks.
 *
 * Usage: roleProtectedProcedure(["Director", "Legal_Officer"])
 */
export function roleProtectedProcedure(roles: string[]) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const userRoles = ctx.session.roles ?? []

    if (!checkRole(userRoles, roles)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Bạn không có quyền thực hiện thao tác này. Yêu cầu vai trò: ${roles.join(', ')}`,
      })
    }

    return next({ ctx })
  })
}

/**
 * Audited procedure — protected procedure with automatic audit logging.
 * Use this for mutations that don't already have manual audit logging,
 * or as a fallback layer for all mutations.
 *
 * The audit middleware:
 * - Only logs mutations (not queries)
 * - Skips sensitive paths (auth.login, password changes)
 * - Sanitizes input (removes password fields)
 * - Non-blocking (audit failures don't fail the mutation)
 */
export const auditedProcedure = protectedProcedure.use(
  t.middleware(async ({ ctx, path, type, input, next }) => {
    // Only audit mutations
    if (type !== 'mutation') {
      return next({ ctx })
    }

    // Skip sensitive paths
    if (SKIP_PATHS.has(path)) {
      return next({ ctx })
    }

    // Execute the mutation first
    const result = await next({ ctx })

    // Only log successful mutations
    if (result.ok) {
      createAuditEntry({ ctx: ctx as TRPCContext, path, input })
    }

    return result
  })
)

/**
 * Scoped procedure factory.
 * Checks role AND scope (e.g., user must have "Project_Manager" role with scope "project:{projectId}").
 * Requires fetching UserRole records from DB to check scope field.
 * System_Admin bypasses all checks.
 *
 * Usage: scopedProcedure(["Project_Manager"], "project")
 * Then in the procedure, pass scopeId via input.
 */
export function scopedProcedure(roles: string[], scopeType: string) {
  return protectedProcedure.use(async ({ ctx, next, input }) => {
    const userId = ctx.session.user.id
    const userRoles = ctx.session.roles ?? []

    // System_Admin bypasses all checks
    if (userRoles.includes("System_Admin")) {
      return next({ ctx })
    }

    // First check if user has the role at all (fast path)
    if (!checkRole(userRoles, roles)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Bạn không có quyền thực hiện thao tác này. Yêu cầu vai trò: ${roles.join(', ')}`,
      })
    }

    // Fetch user roles with scope from DB for scope validation
    const dbUserRoles = await ctx.db.userRole.findMany({
      where: { userId },
      include: { role: true },
    })

    const userRolesWithScope: UserRoleWithScope[] = dbUserRoles.map((ur) => ({
      roleName: ur.role.name,
      scope: ur.scope,
    }))

    // Extract scopeId from input (expects input to have a field matching scopeType + "Id")
    // e.g., scopeType "project" → looks for "projectId" in input
    const scopeIdKey = `${scopeType}Id`
    const inputObj = input as unknown as Record<string, unknown> | undefined
    const scopeId = inputObj?.[scopeIdKey] as string | undefined

    if (!scopeId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Thiếu thông tin phạm vi (${scopeIdKey}) để kiểm tra quyền.`,
      })
    }

    // Check scope
    const hasScope = checkScope(userRolesWithScope, roles[0]!, scopeType, scopeId)
    if (!hasScope) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Bạn không có quyền trong phạm vi ${scopeType}:${scopeId}.`,
      })
    }

    return next({ ctx })
  })
}
