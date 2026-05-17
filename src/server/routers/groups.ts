import { z } from 'zod'
import { GroupType, GroupVisibility, GroupRole, GroupMemberStatus, GroupStatus } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, roleProtectedProcedure } from '../trpc'
import { buildVisibilityFilter, canViewGroup, validateMembershipPolicy, type GroupAccessContext } from '../services/group-access'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const groupTypeEnum = z.nativeEnum(GroupType)
const groupVisibilityEnum = z.nativeEnum(GroupVisibility)
const groupRoleEnum = z.nativeEnum(GroupRole)
const groupStatusEnum = z.nativeEnum(GroupStatus)

const createGroupInput = z.object({
  name: z.string().min(1, 'Tên nhóm không được để trống'),
  type: groupTypeEnum,
  description: z.string().optional().nullable(),
  goal: z.string().min(1, 'Mục tiêu nhóm không được để trống'),
  visibility: groupVisibilityEnum.optional(),
  membershipPolicy: z.string().optional(),
})

const updateGroupInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  type: groupTypeEnum.optional(),
  description: z.string().optional().nullable(),
  goal: z.string().min(1).optional(),
  visibility: groupVisibilityEnum.optional(),
  membershipPolicy: z.string().optional(),
  status: groupStatusEnum.optional(),
})

// ─── Helper: Check if user is group owner or moderator ────────────────────────

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

// ─── Groups Router ────────────────────────────────────────────────────────────

export const groupsRouter = router({
  /**
   * List working groups with filtering (by type, visibility, status) and pagination.
   * Applies visibility-based filtering per R12:
   * - PUBLIC_TO_MEMBERS: visible to all authenticated members
   * - PRIVATE_INVITE_ONLY: only visible to group members
   * - CORE_ONLY: only visible to Core_Team_Member role
   * - PROJECT_ONLY: only visible to project participants (group members)
   * - COUNCIL_ONLY: only visible to Council_Chair, Council_Member
   * - ENTERPRISE_PRIVATE: only visible to enterprise members of that enterprise
   */
  list: protectedProcedure
    .input(z.object({
      type: groupTypeEnum.optional(),
      visibility: groupVisibilityEnum.optional(),
      status: groupStatusEnum.optional(),
      search: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const {
        type,
        visibility,
        status,
        search,
        page = 0,
        pageSize = 25,
      } = input ?? {}

      const userId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      // Build visibility filter based on user's roles and memberships
      const accessCtx: GroupAccessContext = { userId, roles: userRoles, db: ctx.db }
      const visibilityFilter = await buildVisibilityFilter(accessCtx)

      const where: Record<string, unknown> = {}

      if (type) where.type = type
      if (visibility) where.visibility = visibility
      if (status) where.status = status

      // Apply visibility filter (null means admin bypass)
      if (visibilityFilter) {
        where.AND = [visibilityFilter]
      }

      if (search) {
        const searchConditions = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { goal: { contains: search, mode: 'insensitive' } },
        ]
        if (where.AND) {
          ;(where.AND as unknown[]).push({ OR: searchConditions })
        } else {
          where.OR = searchConditions
        }
      }

      const [items, total] = await Promise.all([
        ctx.db.workingGroup.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: page * pageSize,
          take: pageSize,
          include: {
            _count: { select: { members: true, messages: true } },
          },
        }),
        ctx.db.workingGroup.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get single group by ID with members and messages count.
   * Checks visibility before returning data per R12.
   */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const group = await ctx.db.workingGroup.findUnique({
        where: { id: input.id },
        include: {
          members: {
            where: { status: GroupMemberStatus.ACTIVE },
            orderBy: { joinedDate: 'asc' },
          },
          _count: { select: { messages: true, tasks: true, decisions: true } },
        },
      })

      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Nhóm làm việc không tồn tại' })
      }

      // Check visibility access per R12
      const accessCtx: GroupAccessContext = { userId, roles: userRoles, db: ctx.db }
      const hasAccess = await canViewGroup(accessCtx, group)
      if (!hasAccess) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền xem nhóm này' })
      }

      return group
    }),

  /**
   * Create new working group.
   * Roles: Director, System_Admin, Project_Manager, Community_Officer
   */
  create: roleProtectedProcedure(['Director', 'System_Admin', 'Project_Manager', 'Community_Officer'])
    .input(createGroupInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const group = await ctx.db.$transaction(async (tx: any) => {
        const created = await tx.workingGroup.create({
          data: {
            name: input.name,
            type: input.type,
            description: input.description,
            goal: input.goal,
            ownerId: userId,
            visibility: input.visibility ?? GroupVisibility.PRIVATE_INVITE_ONLY,
            membershipPolicy: input.membershipPolicy ?? 'invite_only',
            status: GroupStatus.ACTIVE,
          },
        })

        // Auto-add creator as OWNER member
        await tx.groupMembership.create({
          data: {
            groupId: created.id,
            userId,
            groupRole: GroupRole.OWNER,
            status: GroupMemberStatus.ACTIVE,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'GROUP_CREATED',
            targetType: 'WorkingGroup',
            targetId: created.id,
            afterVal: { name: input.name, type: input.type, visibility: input.visibility },
          },
        })

        return created
      })

      return group
    }),

  /**
   * Update group fields.
   * Allowed: group owner, moderator, Director, System_Admin
   */
  update: protectedProcedure
    .input(updateGroupInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const existing = await ctx.db.workingGroup.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Nhóm làm việc không tồn tại' })
      }

      // Check permission: admin roles or group owner/moderator
      const hasAdminAccess = ['System_Admin', 'Director'].some((r) => userRoles.includes(r))
      if (!hasAdminAccess) {
        const hasGroupAccess = await isGroupOwnerOrModerator(ctx.db, id, userId)
        if (!hasGroupAccess) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền cập nhật nhóm này' })
        }
      }

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.workingGroup.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'GROUP_UPDATED',
            targetType: 'WorkingGroup',
            targetId: id,
            beforeVal: { name: existing.name, status: existing.status },
            afterVal: updateData,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Invite a user to a group.
   * Enforces membership policy per R14:
   * - open: anyone can join (auto-approve)
   * - approval_required: creates pending membership, needs approval
   * - invite_only: only owner/moderator can invite
   * - tier_restricted: only members of specific tiers can join
   * - role_restricted: only users with specific roles can join
   */
  inviteMember: protectedProcedure
    .input(z.object({
      groupId: z.string(),
      userId: z.string(),
      enterpriseId: z.string().optional(),
      groupRole: groupRoleEnum.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const callerId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const group = await ctx.db.workingGroup.findUnique({ where: { id: input.groupId } })
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Nhóm làm việc không tồn tại' })
      }

      // Determine if caller is owner/moderator or admin
      const hasAdminAccess = ['System_Admin', 'Director'].some((r) => userRoles.includes(r))
      const hasGroupAccess = hasAdminAccess || await isGroupOwnerOrModerator(ctx.db, input.groupId, callerId)

      // Validate membership policy
      const accessCtx: GroupAccessContext = { userId: callerId, roles: userRoles, db: ctx.db }
      const policyResult = await validateMembershipPolicy(
        accessCtx,
        group,
        input.userId,
        hasGroupAccess,
      )

      if (!policyResult.allowed) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: policyResult.reason ?? 'Chính sách nhóm không cho phép thao tác này',
        })
      }

      // Check if user is already a member
      const existingMembership = await ctx.db.groupMembership.findFirst({
        where: {
          groupId: input.groupId,
          userId: input.userId,
          status: { in: [GroupMemberStatus.ACTIVE, GroupMemberStatus.SUSPENDED] },
        },
      })
      if (existingMembership) {
        if (existingMembership.status === GroupMemberStatus.ACTIVE) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Người dùng đã là thành viên của nhóm' })
        }
        if (existingMembership.status === GroupMemberStatus.SUSPENDED) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Người dùng đang chờ phê duyệt tham gia nhóm' })
        }
      }

      const membership = await ctx.db.$transaction(async (tx: any) => {
        const created = await tx.groupMembership.create({
          data: {
            groupId: input.groupId,
            userId: input.userId,
            enterpriseId: input.enterpriseId ?? null,
            groupRole: input.groupRole ?? GroupRole.MEMBER,
            invitedBy: callerId,
            status: policyResult.status,
          },
        })

        const action = policyResult.status === GroupMemberStatus.ACTIVE
          ? 'GROUP_MEMBER_INVITED'
          : 'GROUP_MEMBER_PENDING'

        await tx.auditLog.create({
          data: {
            userId: callerId,
            action,
            targetType: 'GroupMembership',
            targetId: created.id,
            afterVal: {
              groupId: input.groupId,
              userId: input.userId,
              role: input.groupRole ?? 'MEMBER',
              status: policyResult.status,
              policy: group.membershipPolicy,
            },
          },
        })

        return created
      })

      return membership
    }),

  /**
   * Approve pending membership (for approval_required groups).
   * Allowed: group owner, moderator
   */
  approveMember: protectedProcedure
    .input(z.object({
      membershipId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const callerId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const membership = await ctx.db.groupMembership.findUnique({
        where: { id: input.membershipId },
      })
      if (!membership) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Yêu cầu tham gia nhóm không tồn tại' })
      }

      if (membership.status === GroupMemberStatus.ACTIVE) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Thành viên đã được phê duyệt' })
      }

      // Check permission: group owner/moderator
      const hasAdminAccess = ['System_Admin', 'Director'].some((r) => userRoles.includes(r))
      if (!hasAdminAccess) {
        const hasGroupAccess = await isGroupOwnerOrModerator(ctx.db, membership.groupId, callerId)
        if (!hasGroupAccess) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền phê duyệt thành viên nhóm này' })
        }
      }

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.groupMembership.update({
          where: { id: input.membershipId },
          data: { status: GroupMemberStatus.ACTIVE },
        })

        await tx.auditLog.create({
          data: {
            userId: callerId,
            action: 'GROUP_MEMBER_APPROVED',
            targetType: 'GroupMembership',
            targetId: input.membershipId,
            afterVal: { groupId: membership.groupId, userId: membership.userId, status: 'ACTIVE' },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Remove a member from a group.
   * Allowed: group owner, moderator, Director, System_Admin
   */
  removeMember: protectedProcedure
    .input(z.object({
      groupId: z.string(),
      userId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const callerId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const group = await ctx.db.workingGroup.findUnique({ where: { id: input.groupId } })
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Nhóm làm việc không tồn tại' })
      }

      // Check permission: admin roles or group owner/moderator
      const hasAdminAccess = ['System_Admin', 'Director'].some((r) => userRoles.includes(r))
      if (!hasAdminAccess) {
        const hasGroupAccess = await isGroupOwnerOrModerator(ctx.db, input.groupId, callerId)
        if (!hasGroupAccess) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền xóa thành viên khỏi nhóm này' })
        }
      }

      // Cannot remove the group owner
      if (input.userId === group.ownerId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Không thể xóa chủ sở hữu nhóm' })
      }

      // Find active membership
      const membership = await ctx.db.groupMembership.findFirst({
        where: {
          groupId: input.groupId,
          userId: input.userId,
          status: GroupMemberStatus.ACTIVE,
        },
      })
      if (!membership) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Người dùng không phải thành viên hoạt động của nhóm' })
      }

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.groupMembership.update({
          where: { id: membership.id },
          data: { status: GroupMemberStatus.REMOVED },
        })

        await tx.auditLog.create({
          data: {
            userId: callerId,
            action: 'GROUP_MEMBER_REMOVED',
            targetType: 'GroupMembership',
            targetId: membership.id,
            beforeVal: { groupId: input.groupId, userId: input.userId, status: 'ACTIVE' },
            afterVal: { status: 'REMOVED' },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Update a member's group role.
   * Allowed: group owner, moderator, Director, System_Admin
   */
  updateMemberRole: protectedProcedure
    .input(z.object({
      groupId: z.string(),
      userId: z.string(),
      newRole: groupRoleEnum,
    }))
    .mutation(async ({ input, ctx }) => {
      const callerId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const group = await ctx.db.workingGroup.findUnique({ where: { id: input.groupId } })
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Nhóm làm việc không tồn tại' })
      }

      // Check permission: admin roles or group owner/moderator
      const hasAdminAccess = ['System_Admin', 'Director'].some((r) => userRoles.includes(r))
      if (!hasAdminAccess) {
        const hasGroupAccess = await isGroupOwnerOrModerator(ctx.db, input.groupId, callerId)
        if (!hasGroupAccess) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền thay đổi vai trò thành viên nhóm' })
        }
      }

      // Cannot change owner role via this endpoint (use transfer ownership instead)
      if (input.userId === group.ownerId && input.newRole !== GroupRole.OWNER) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Không thể thay đổi vai trò chủ sở hữu nhóm qua thao tác này' })
      }

      // Find active membership
      const membership = await ctx.db.groupMembership.findFirst({
        where: {
          groupId: input.groupId,
          userId: input.userId,
          status: GroupMemberStatus.ACTIVE,
        },
      })
      if (!membership) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Người dùng không phải thành viên hoạt động của nhóm' })
      }

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.groupMembership.update({
          where: { id: membership.id },
          data: { groupRole: input.newRole },
        })

        await tx.auditLog.create({
          data: {
            userId: callerId,
            action: 'GROUP_MEMBER_ROLE_UPDATED',
            targetType: 'GroupMembership',
            targetId: membership.id,
            beforeVal: { groupRole: membership.groupRole },
            afterVal: { groupRole: input.newRole },
          },
        })

        return result
      })

      return updated
    }),
})
