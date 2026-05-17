import { z } from 'zod'
import { router, roleProtectedProcedure } from '../trpc'

// ─── Audit Logs Router ────────────────────────────────────────────────────────
// Accessible by System_Admin, Auditor, Director only.

const auditProcedure = roleProtectedProcedure([
  'System_Admin',
  'Auditor',
  'Director',
])

export const auditLogsRouter = router({
  /**
   * Paginated list of audit log entries with filters.
   */
  list: auditProcedure
    .input(
      z.object({
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(100).default(25),
        userId: z.string().optional(),
        action: z.string().optional(),
        targetType: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        search: z.string().optional(),
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      const {
        page = 0,
        pageSize = 25,
        userId,
        action,
        targetType,
        dateFrom,
        dateTo,
        search,
      } = input ?? {}

      // Build where clause
      const where: Record<string, unknown> = {}

      if (userId) {
        where.userId = userId
      }

      if (action) {
        where.action = { contains: action, mode: 'insensitive' }
      }

      if (targetType) {
        where.targetType = { contains: targetType, mode: 'insensitive' }
      }

      if (dateFrom || dateTo) {
        const timestampFilter: Record<string, Date> = {}
        if (dateFrom) timestampFilter.gte = new Date(dateFrom)
        if (dateTo) {
          // Include the entire end day
          const endDate = new Date(dateTo)
          endDate.setHours(23, 59, 59, 999)
          timestampFilter.lte = endDate
        }
        where.timestamp = timestampFilter
      }

      if (search) {
        where.OR = [
          { action: { contains: search, mode: 'insensitive' } },
          { targetType: { contains: search, mode: 'insensitive' } },
          { targetId: { contains: search, mode: 'insensitive' } },
        ]
      }

      const [items, total] = await Promise.all([
        ctx.db.auditLog.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip: page * pageSize,
          take: pageSize,
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        }),
        ctx.db.auditLog.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get a single audit log entry by ID.
   */
  get: auditProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const entry = await ctx.db.auditLog.findUnique({
        where: { id: input.id },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      })

      return entry
    }),
})
