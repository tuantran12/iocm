import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, roleProtectedProcedure } from '../trpc'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createEventInput = z.object({
  name: z.string().min(1, 'Tên sự kiện không được để trống'),
  type: z.string().min(1, 'Loại sự kiện không được để trống'),
  description: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  eligibleTiers: z.array(z.string()).default([]),
  startTime: z.string().datetime('Thời gian bắt đầu không hợp lệ'),
  endTime: z.string().datetime('Thời gian kết thúc không hợp lệ').optional().nullable(),
  location: z.string().optional().nullable(),
  capacity: z.number().int().positive('Sức chứa phải lớn hơn 0').optional().nullable(),
  registration: z.boolean().default(false),
  materialsUrl: z.string().url('URL tài liệu không hợp lệ').optional().nullable(),
  minutesUrl: z.string().url('URL biên bản không hợp lệ').optional().nullable(),
  status: z.string().default('planned'),
})

const updateEventInput = z.object({
  id: z.string().min(1, 'ID sự kiện không được để trống'),
  name: z.string().min(1, 'Tên sự kiện không được để trống').optional(),
  type: z.string().min(1, 'Loại sự kiện không được để trống').optional(),
  description: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  eligibleTiers: z.array(z.string()).optional(),
  startTime: z.string().datetime('Thời gian bắt đầu không hợp lệ').optional(),
  endTime: z.string().datetime('Thời gian kết thúc không hợp lệ').optional().nullable(),
  location: z.string().optional().nullable(),
  capacity: z.number().int().positive('Sức chứa phải lớn hơn 0').optional().nullable(),
  registration: z.boolean().optional(),
  materialsUrl: z.string().url('URL tài liệu không hợp lệ').optional().nullable(),
  minutesUrl: z.string().url('URL biên bản không hợp lệ').optional().nullable(),
  status: z.string().optional(),
})

// ─── Events Router ────────────────────────────────────────────────────────────

export const eventsRouter = router({
  /**
   * List events with optional filters (status, type, upcoming/past).
   * Roles: Community_Officer, Director, System_Admin
   */
  list: roleProtectedProcedure(['Community_Officer', 'Director', 'System_Admin'])
    .input(z.object({
      status: z.string().optional(),
      type: z.string().optional(),
      timeFilter: z.enum(['upcoming', 'past', 'all']).optional(),
      search: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const { status, type, timeFilter, search, page = 0, pageSize = 25 } = input ?? {}

      const where: Record<string, unknown> = {}
      if (status) where.status = status
      if (type) where.type = type

      if (timeFilter === 'upcoming') {
        where.startTime = { gte: new Date() }
      } else if (timeFilter === 'past') {
        where.startTime = { lt: new Date() }
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
        ]
      }

      const [items, total] = await Promise.all([
        ctx.db.event.findMany({
          where,
          orderBy: { startTime: 'desc' },
          skip: page * pageSize,
          take: pageSize,
          include: {
            _count: { select: { attendees: true } },
          },
        }),
        ctx.db.event.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get single event by ID with attendees count.
   * Roles: Community_Officer, Director, System_Admin
   */
  get: roleProtectedProcedure(['Community_Officer', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string().min(1, 'ID sự kiện không được để trống') }))
    .query(async ({ input, ctx }) => {
      const event = await ctx.db.event.findUnique({
        where: { id: input.id },
        include: {
          _count: { select: { attendees: true } },
        },
      })
      if (!event) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sự kiện không tồn tại' })
      }
      return event
    }),

  /**
   * Create event.
   * Roles: Community_Officer, Director, System_Admin
   */
  create: roleProtectedProcedure(['Community_Officer', 'Director', 'System_Admin'])
    .input(createEventInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const event = await ctx.db.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: {
            name: input.name,
            type: input.type,
            description: input.description ?? null,
            organizerId: userId,
            groupId: input.groupId ?? null,
            eligibleTiers: input.eligibleTiers,
            startTime: new Date(input.startTime),
            endTime: input.endTime ? new Date(input.endTime) : null,
            location: input.location ?? null,
            capacity: input.capacity ?? null,
            registration: input.registration,
            materialsUrl: input.materialsUrl ?? null,
            minutesUrl: input.minutesUrl ?? null,
            status: input.status,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'EVENT_CREATED',
            targetType: 'Event',
            targetId: created.id,
            afterVal: {
              name: created.name,
              type: created.type,
              startTime: created.startTime.toISOString(),
              status: created.status,
            },
          },
        })

        return created
      })

      return event
    }),

  /**
   * Update event fields.
   * Roles: Community_Officer, Director, System_Admin
   */
  update: roleProtectedProcedure(['Community_Officer', 'Director', 'System_Admin'])
    .input(updateEventInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id
      const { id, ...data } = input

      const existing = await ctx.db.event.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sự kiện không tồn tại' })
      }

      const updateData: Record<string, unknown> = {}
      if (data.name !== undefined) updateData.name = data.name
      if (data.type !== undefined) updateData.type = data.type
      if (data.description !== undefined) updateData.description = data.description
      if (data.groupId !== undefined) updateData.groupId = data.groupId
      if (data.eligibleTiers !== undefined) updateData.eligibleTiers = data.eligibleTiers
      if (data.startTime !== undefined) updateData.startTime = new Date(data.startTime)
      if (data.endTime !== undefined) updateData.endTime = data.endTime ? new Date(data.endTime) : null
      if (data.location !== undefined) updateData.location = data.location
      if (data.capacity !== undefined) updateData.capacity = data.capacity
      if (data.registration !== undefined) updateData.registration = data.registration
      if (data.materialsUrl !== undefined) updateData.materialsUrl = data.materialsUrl
      if (data.minutesUrl !== undefined) updateData.minutesUrl = data.minutesUrl
      if (data.status !== undefined) updateData.status = data.status

      const event = await ctx.db.$transaction(async (tx) => {
        const updated = await tx.event.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'EVENT_UPDATED',
            targetType: 'Event',
            targetId: id,
            beforeVal: {
              name: existing.name,
              type: existing.type,
              status: existing.status,
              startTime: existing.startTime.toISOString(),
            },
            afterVal: {
              name: updated.name,
              type: updated.type,
              status: updated.status,
              startTime: updated.startTime.toISOString(),
            },
          },
        })

        return updated
      })

      return event
    }),

  /**
   * Delete event.
   * Roles: Community_Officer, Director, System_Admin
   */
  delete: roleProtectedProcedure(['Community_Officer', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string().min(1, 'ID sự kiện không được để trống') }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.event.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sự kiện không tồn tại' })
      }

      await ctx.db.$transaction(async (tx) => {
        // Delete attendees first (cascade)
        await tx.eventAttendee.deleteMany({ where: { eventId: input.id } })
        await tx.event.delete({ where: { id: input.id } })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'EVENT_DELETED',
            targetType: 'Event',
            targetId: input.id,
            beforeVal: {
              name: existing.name,
              type: existing.type,
              status: existing.status,
              startTime: existing.startTime.toISOString(),
            },
          },
        })
      })

      return { success: true }
    }),

  // ─── Registration ───────────────────────────────────────────────────────────

  /**
   * Register current user for an event.
   * Any authenticated user can register.
   */
  register: protectedProcedure
    .input(z.object({ eventId: z.string().min(1, 'ID sự kiện không được để trống') }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const event = await ctx.db.event.findUnique({
        where: { id: input.eventId },
        include: { _count: { select: { attendees: true } } },
      })
      if (!event) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sự kiện không tồn tại' })
      }

      if (!event.registration) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sự kiện này không mở đăng ký' })
      }

      if (event.status === 'cancelled') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sự kiện đã bị hủy' })
      }

      // Check capacity
      if (event.capacity && event._count.attendees >= event.capacity) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sự kiện đã đủ số lượng đăng ký' })
      }

      // Check if already registered
      const existingRegistration = await ctx.db.eventAttendee.findFirst({
        where: { eventId: input.eventId, userId },
      })
      if (existingRegistration) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Bạn đã đăng ký sự kiện này rồi' })
      }

      const attendee = await ctx.db.$transaction(async (tx) => {
        const created = await tx.eventAttendee.create({
          data: {
            eventId: input.eventId,
            userId,
            status: 'registered',
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'EVENT_REGISTERED',
            targetType: 'EventAttendee',
            targetId: created.id,
            afterVal: {
              eventId: input.eventId,
              eventName: event.name,
            },
          },
        })

        return created
      })

      return attendee
    }),

  /**
   * Unregister current user from an event.
   * Any authenticated user can unregister.
   */
  unregister: protectedProcedure
    .input(z.object({ eventId: z.string().min(1, 'ID sự kiện không được để trống') }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const event = await ctx.db.event.findUnique({ where: { id: input.eventId } })
      if (!event) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sự kiện không tồn tại' })
      }

      const registration = await ctx.db.eventAttendee.findFirst({
        where: { eventId: input.eventId, userId },
      })
      if (!registration) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bạn chưa đăng ký sự kiện này' })
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.eventAttendee.delete({ where: { id: registration.id } })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'EVENT_UNREGISTERED',
            targetType: 'EventAttendee',
            targetId: registration.id,
            afterVal: {
              eventId: input.eventId,
              eventName: event.name,
            },
          },
        })
      })

      return { success: true }
    }),

  // ─── Attendance ─────────────────────────────────────────────────────────────

  /**
   * Mark a user as attended (set status to 'attended').
   * Roles: Community_Officer, Director, System_Admin
   */
  markAttendance: roleProtectedProcedure(['Community_Officer', 'Director', 'System_Admin'])
    .input(z.object({
      eventId: z.string().min(1, 'ID sự kiện không được để trống'),
      userId: z.string().min(1, 'ID người dùng không được để trống'),
    }))
    .mutation(async ({ input, ctx }) => {
      const currentUserId = ctx.session.user.id

      const event = await ctx.db.event.findUnique({ where: { id: input.eventId } })
      if (!event) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sự kiện không tồn tại' })
      }

      const attendee = await ctx.db.eventAttendee.findFirst({
        where: { eventId: input.eventId, userId: input.userId },
      })
      if (!attendee) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Người dùng chưa đăng ký sự kiện này' })
      }

      if (attendee.status === 'attended') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Người dùng đã được điểm danh rồi' })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.eventAttendee.update({
          where: { id: attendee.id },
          data: { status: 'attended' },
        })

        await tx.auditLog.create({
          data: {
            userId: currentUserId,
            action: 'EVENT_ATTENDANCE_MARKED',
            targetType: 'EventAttendee',
            targetId: attendee.id,
            beforeVal: { status: attendee.status },
            afterVal: { status: 'attended', userId: input.userId, eventName: event.name },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * List attendees for an event.
   * Roles: Community_Officer, Director, System_Admin
   */
  listAttendees: roleProtectedProcedure(['Community_Officer', 'Director', 'System_Admin'])
    .input(z.object({
      eventId: z.string().min(1, 'ID sự kiện không được để trống'),
      status: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { eventId, status, page = 0, pageSize = 50 } = input

      const event = await ctx.db.event.findUnique({ where: { id: eventId } })
      if (!event) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sự kiện không tồn tại' })
      }

      const where: Record<string, unknown> = { eventId }
      if (status) where.status = status

      const [items, total] = await Promise.all([
        ctx.db.eventAttendee.findMany({
          where,
          orderBy: { id: 'asc' },
          skip: page * pageSize,
          take: pageSize,
        }),
        ctx.db.eventAttendee.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),
})
