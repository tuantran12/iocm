import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { router, roleProtectedProcedure, protectedProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

/**
 * Users router â€” CRUD users, assign/remove roles.
 * Only System_Admin can access these procedures (except search).
 */
export const usersRouter = router({
  /**
   * Search users by name or email (for Autocomplete fields).
   * Available to any authenticated user.
   */
  search: protectedProcedure
    .input(z.object({ query: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const q = input?.query?.trim()
      const where = q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ],
            status: 'ACTIVE' as const,
          }
        : { status: 'ACTIVE' as const }

      const users = await ctx.db.user.findMany({
        where,
        select: { id: true, name: true, email: true },
        take: 50,
        orderBy: { name: 'asc' },
      })

      return users
    }),

  /**
   * List all users with their roles and status.
   */
  list: roleProtectedProcedure(['System_Admin']).query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      include: {
        roles: {
          include: { role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      status: user.status,
      twoFactor: user.twoFactor,
      createdAt: user.createdAt,
      roles: user.roles.map((ur) => ({
        id: ur.id,
        roleId: ur.role.id,
        roleName: ur.role.name,
        scope: ur.scope,
      })),
    }))
  }),

  /**
   * Create a new user with optional role assignments.
   */
  create: roleProtectedProcedure(['System_Admin'])
    .input(
      z.object({
        name: z.string().min(1, 'TÃªn khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng'),
        email: z.string().email('Email khÃ´ng há»£p lá»‡'),
        password: z
          .string()
          .min(8, 'Máº­t kháº©u pháº£i cÃ³ Ã­t nháº¥t 8 kÃ½ tá»±')
          .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Máº­t kháº©u pháº£i chá»©a Ã­t nháº¥t 1 chá»¯ hoa, 1 chá»¯ thÆ°á»ng vÃ  1 sá»‘'
          ),
        phone: z.string().optional(),
        roleIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if email already exists
      const existing = await ctx.db.user.findUnique({
        where: { email: input.email },
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Email Ä‘Ã£ tá»“n táº¡i trong há»‡ thá»‘ng',
        })
      }

      const passwordHash = await bcrypt.hash(input.password, 12)

      const user = await ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          phone: input.phone,
          roles: input.roleIds?.length
            ? {
                create: input.roleIds.map((roleId) => ({
                  roleId,
                  scope: 'org',
                })),
              }
            : undefined,
        },
        include: {
          roles: { include: { role: true } },
        },
      })

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: 'USER_CREATED',
          targetType: 'User',
          targetId: user.id,
          afterVal: {
            name: user.name,
            email: user.email,
            roles: user.roles.map((ur) => ur.role.name),
          },
        },
      })

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles.map((ur) => ({
          id: ur.id,
          roleId: ur.role.id,
          roleName: ur.role.name,
          scope: ur.scope,
        })),
      }
    }),

  /**
   * Update user info (name, phone, status).
   */
  update: roleProtectedProcedure(['System_Admin'])
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input

      const before = await ctx.db.user.findUnique({ where: { id } })
      if (!before) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng' })
      }

      const user = await ctx.db.user.update({
        where: { id },
        data,
      })

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: 'USER_UPDATED',
          targetType: 'User',
          targetId: id,
          beforeVal: { name: before.name, phone: before.phone, status: before.status },
          afterVal: { name: user.name, phone: user.phone, status: user.status },
        },
      })

      return { id: user.id, name: user.name, status: user.status }
    }),

  /**
   * Assign a role to a user.
   */
  assignRole: roleProtectedProcedure(['System_Admin'])
    .input(
      z.object({
        userId: z.string(),
        roleId: z.string(),
        scope: z.string().default('org'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check user exists
      const user = await ctx.db.user.findUnique({ where: { id: input.userId } })
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng' })
      }

      // Check role exists
      const role = await ctx.db.role.findUnique({ where: { id: input.roleId } })
      if (!role) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KhÃ´ng tÃ¬m tháº¥y vai trÃ²' })
      }

      // Check if already assigned
      const existing = await ctx.db.userRole.findFirst({
        where: {
          userId: input.userId,
          roleId: input.roleId,
          scope: input.scope,
        },
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `NgÆ°á»i dÃ¹ng Ä‘Ã£ cÃ³ vai trÃ² "${role.name}" vá»›i pháº¡m vi nÃ y`,
        })
      }

      const userRole = await ctx.db.userRole.create({
        data: {
          userId: input.userId,
          roleId: input.roleId,
          scope: input.scope,
        },
        include: { role: true },
      })

      // Audit log â€” permission change
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: 'ROLE_ASSIGNED',
          targetType: 'UserRole',
          targetId: userRole.id,
          afterVal: {
            userId: input.userId,
            roleName: role.name,
            scope: input.scope,
            changedBy: ctx.session.user.id,
          },
        },
      })

      return {
        id: userRole.id,
        roleId: role.id,
        roleName: role.name,
        scope: userRole.scope,
      }
    }),

  /**
   * Remove a role from a user.
   */
  removeRole: roleProtectedProcedure(['System_Admin'])
    .input(
      z.object({
        userRoleId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userRole = await ctx.db.userRole.findUnique({
        where: { id: input.userRoleId },
        include: { role: true, user: true },
      })

      if (!userRole) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KhÃ´ng tÃ¬m tháº¥y phÃ¢n quyá»n nÃ y' })
      }

      await ctx.db.userRole.delete({ where: { id: input.userRoleId } })

      // Audit log â€” permission change
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: 'ROLE_REMOVED',
          targetType: 'UserRole',
          targetId: input.userRoleId,
          beforeVal: {
            userId: userRole.userId,
            roleName: userRole.role.name,
            scope: userRole.scope,
            changedBy: ctx.session.user.id,
          },
        },
      })

      return { success: true }
    }),

  /**
   * List all available roles (for role assignment UI).
   */
  listRoles: roleProtectedProcedure(['System_Admin']).query(async ({ ctx }) => {
    const roles = await ctx.db.role.findMany({
      orderBy: { name: 'asc' },
    })
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
    }))
  }),

  /**
   * Delete a user (soft delete by setting status to DEACTIVATED).
   */
  delete: roleProtectedProcedure(['System_Admin'])
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input.id } })
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng' })
      }

      // Prevent deleting yourself
      if (input.id === ctx.session.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'KhÃ´ng thá»ƒ vÃ´ hiá»‡u hÃ³a tÃ i khoáº£n cá»§a chÃ­nh mÃ¬nh',
        })
      }

      await ctx.db.user.update({
        where: { id: input.id },
        data: { status: 'DEACTIVATED' },
      })

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: 'USER_DEACTIVATED',
          targetType: 'User',
          targetId: input.id,
          beforeVal: { status: user.status },
          afterVal: { status: 'DEACTIVATED' },
        },
      })

      return { success: true }
    }),
})
