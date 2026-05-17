import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { GroupMemberStatus, GroupRole } from '@prisma/client'
import { router, protectedProcedure } from '../trpc'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const meetingStatusEnum = z.enum(['draft', 'approved'])

const participantSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  role: z.string().optional(),
})

const actionItemSchema = z.object({
  title: z.string().min(1),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'done']).optional(),
})

const listMeetingsInput = z.object({
  groupId: z.string().min(1, 'groupId is required'),
  status: meetingStatusEnum.optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

const getMeetingInput = z.object({
  id: z.string().min(1, 'id is required'),
})

const createMeetingInput = z.object({
  groupId: z.string().min(1, 'groupId is required'),
  meetingDate: z.string().min(1, 'Ngày họp không được để trống'),
  participants: z.array(participantSchema).min(1, 'Phải có ít nhất 1 người tham dự'),
  agenda: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  decisions: z.array(z.string()).optional().nullable(),
  actionItems: z.array(actionItemSchema).optional().nullable(),
})

const updateMeetingInput = z.object({
  id: z.string().min(1, 'id is required'),
  meetingDate: z.string().optional(),
  participants: z.array(participantSchema).optional(),
  agenda: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  decisions: z.array(z.string()).optional().nullable(),
  actionItems: z.array(actionItemSchema).optional().nullable(),
})

const approveMeetingInput = z.object({
  id: z.string().min(1, 'id is required'),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isGroupMember(
  db: any,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const membership = await db.groupMembership.findFirst({
    where: { groupId, userId, status: GroupMemberStatus.ACTIVE },
  })
  return !!membership
}

async function isGroupOwnerOrModerator(
  db: any,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const membership = await db.groupMembership.findFirst({
    where: {
      groupId,
      userId,
      status: GroupMemberStatus.ACTIVE,
      groupRole: { in: [GroupRole.OWNER, GroupRole.MODERATOR] },
    },
  })
  return !!membership
}

// ─── Meetings Router ──────────────────────────────────────────────────────────

export const meetingsRouter = router({
  /**
   * List meeting minutes for a group with optional status filter and pagination.
   * User must be an active member of the group.
   */
  list: protectedProcedure
    .input(listMeetingsInput)
    .query(async ({ input, ctx }) => {
      const { groupId, status, page = 0, pageSize = 25 } = input
      const userId = ctx.session.user.id

      const isMember = await isGroupMember(ctx.db, groupId, userId)
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không phải thành viên của nhóm này',
        })
      }

      const where: Record<string, unknown> = { groupId }
      if (status) where.status = status

      const [items, total] = await Promise.all([
        ctx.db.meetingMinutes.findMany({
          where,
          orderBy: { meetingDate: 'desc' },
          skip: page * pageSize,
          take: pageSize,
        }),
        ctx.db.meetingMinutes.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get a single meeting minutes by ID.
   * User must be an active member of the meeting's group.
   */
  get: protectedProcedure
    .input(getMeetingInput)
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const meeting = await ctx.db.meetingMinutes.findUnique({
        where: { id: input.id },
        include: { group: { select: { id: true, name: true, type: true } } },
      })

      if (!meeting) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Biên bản họp không tồn tại',
        })
      }

      const isMember = await isGroupMember(ctx.db, meeting.groupId, userId)
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không phải thành viên của nhóm này',
        })
      }

      return meeting
    }),

  /**
   * Create new meeting minutes within a group.
   * Any active group member can create meeting minutes.
   * Status starts as "draft".
   */
  create: protectedProcedure
    .input(createMeetingInput)
    .mutation(async ({ input, ctx }) => {
      const { groupId, meetingDate, participants, agenda, summary, decisions, actionItems } = input
      const userId = ctx.session.user.id

      const isMember = await isGroupMember(ctx.db, groupId, userId)
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn phải là thành viên nhóm để tạo biên bản họp',
        })
      }

      const meeting = await ctx.db.$transaction(async (tx: any) => {
        const created = await tx.meetingMinutes.create({
          data: {
            groupId,
            meetingDate: new Date(meetingDate),
            participants: participants,
            agenda: agenda ?? null,
            summary: summary ?? null,
            decisions: decisions ?? null,
            actionItems: actionItems ?? null,
            status: 'draft',
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'MEETING_MINUTES_CREATED',
            targetType: 'MeetingMinutes',
            targetId: created.id,
            afterVal: { groupId, meetingDate, status: 'draft' },
          },
        })

        return created
      })

      return meeting
    }),

  /**
   * Update meeting minutes. Only allowed when status is "draft".
   * User must be an active member of the group.
   */
  update: protectedProcedure
    .input(updateMeetingInput)
    .mutation(async ({ input, ctx }) => {
      const { id, meetingDate, participants, agenda, summary, decisions, actionItems } = input
      const userId = ctx.session.user.id

      const meeting = await ctx.db.meetingMinutes.findUnique({
        where: { id },
      })

      if (!meeting) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Biên bản họp không tồn tại',
        })
      }

      if (meeting.status !== 'draft') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Chỉ có thể chỉnh sửa biên bản ở trạng thái "draft"',
        })
      }

      const isMember = await isGroupMember(ctx.db, meeting.groupId, userId)
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không phải thành viên của nhóm này',
        })
      }

      const data: Record<string, unknown> = {}
      if (meetingDate !== undefined) data.meetingDate = new Date(meetingDate)
      if (participants !== undefined) data.participants = participants
      if (agenda !== undefined) data.agenda = agenda ?? null
      if (summary !== undefined) data.summary = summary ?? null
      if (decisions !== undefined) data.decisions = decisions ?? null
      if (actionItems !== undefined) data.actionItems = actionItems ?? null

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.meetingMinutes.update({
          where: { id },
          data,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'MEETING_MINUTES_UPDATED',
            targetType: 'MeetingMinutes',
            targetId: id,
            beforeVal: { status: meeting.status },
            afterVal: data,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Approve meeting minutes. Only group owner or moderator can approve.
   * Meeting must be in "draft" status.
   */
  approve: protectedProcedure
    .input(approveMeetingInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const meeting = await ctx.db.meetingMinutes.findUnique({
        where: { id: input.id },
      })

      if (!meeting) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Biên bản họp không tồn tại',
        })
      }

      if (meeting.status !== 'draft') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Chỉ có thể phê duyệt biên bản ở trạng thái "draft"',
        })
      }

      const hasPermission = await isGroupOwnerOrModerator(ctx.db, meeting.groupId, userId)
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Chỉ chủ nhóm hoặc moderator mới có thể phê duyệt biên bản họp',
        })
      }

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.meetingMinutes.update({
          where: { id: input.id },
          data: {
            status: 'approved',
            approvedBy: userId,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'MEETING_MINUTES_APPROVED',
            targetType: 'MeetingMinutes',
            targetId: input.id,
            beforeVal: { status: 'draft' },
            afterVal: { status: 'approved', approvedBy: userId },
          },
        })

        return result
      })

      return updated
    }),
})
