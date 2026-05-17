import { z } from 'zod'
import { MembershipStatus } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, roleProtectedProcedure } from '../trpc'
import { VALID_STATUS_TRANSITIONS, isValidTransition } from '../membership-status'
import { suspendEnterpriseGroupMemberships, removeEnterpriseGroupMemberships } from '../services/group-membership-sync'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const membershipStatusEnum = z.nativeEnum(MembershipStatus)

const createMemberInput = z.object({
  legalNameVi: z.string().min(1, 'Tên pháp lý tiếng Việt không được để trống'),
  legalNameEn: z.string().optional().nullable(),
  taxCode: z.string().optional().nullable(),
  businessRegNumber: z.string().optional().nullable(),
  legalRepresentative: z.string().min(1, 'Người đại diện pháp luật không được để trống'),
  address: z.string().min(1, 'Địa chỉ không được để trống'),
  website: z.string().optional().nullable(),
  industrySector: z.string().optional().nullable(),
  technologyDomains: z.array(z.string()).optional(),
  companySize: z.string().optional().nullable(),
  contactName: z.string().min(1, 'Tên người liên hệ không được để trống'),
  contactEmail: z.string().email('Email không hợp lệ'),
  contactPhone: z.string().min(1, 'Số điện thoại không được để trống'),
  membershipTierId: z.string().min(1, 'Cấp hội viên không được để trống'),
})

const updateMemberInput = z.object({
  id: z.string(),
  legalNameVi: z.string().min(1).optional(),
  legalNameEn: z.string().optional().nullable(),
  taxCode: z.string().optional().nullable(),
  businessRegNumber: z.string().optional().nullable(),
  legalRepresentative: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  website: z.string().optional().nullable(),
  industrySector: z.string().optional().nullable(),
  technologyDomains: z.array(z.string()).optional(),
  companySize: z.string().optional().nullable(),
  contactName: z.string().min(1).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().min(1).optional(),
  membershipTierId: z.string().optional(),
})

// ─── Members Router ───────────────────────────────────────────────────────────

export const membersRouter = router({
  /**
   * List enterprise members with filtering, search, and pagination.
   * Roles: Membership_Manager, Director, System_Admin
   */
  list: roleProtectedProcedure(['Membership_Manager', 'Director', 'System_Admin'])
    .input(z.object({
      // Filters
      tierId: z.string().optional(),
      status: membershipStatusEnum.optional(),
      search: z.string().optional(),
      // Pagination
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      // Sort
      sortField: z.string().optional(),
      sortDirection: z.enum(['asc', 'desc']).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const {
        tierId,
        status,
        search,
        page = 0,
        pageSize = 25,
        sortField = 'createdAt',
        sortDirection = 'desc',
      } = input ?? {}

      const where: Record<string, unknown> = {}

      if (tierId) where.membershipTierId = tierId
      if (status) where.membershipStatus = status

      if (search) {
        where.OR = [
          { legalNameVi: { contains: search, mode: 'insensitive' } },
          { legalNameEn: { contains: search, mode: 'insensitive' } },
          { taxCode: { contains: search, mode: 'insensitive' } },
          { contactName: { contains: search, mode: 'insensitive' } },
          { contactEmail: { contains: search, mode: 'insensitive' } },
        ]
      }

      const allowedSortFields = [
        'legalNameVi', 'legalNameEn', 'membershipStatus',
        'joinedDate', 'createdAt', 'updatedAt',
      ]
      const orderBy: Record<string, string> = {}
      if (sortField && allowedSortFields.includes(sortField)) {
        orderBy[sortField] = sortDirection ?? 'desc'
      } else {
        orderBy.createdAt = 'desc'
      }

      const [items, total] = await Promise.all([
        ctx.db.enterpriseMember.findMany({
          where,
          orderBy,
          skip: page * pageSize,
          take: pageSize,
          include: {
            tier: { select: { id: true, name: true, annualFee: true } },
          },
        }),
        ctx.db.enterpriseMember.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get single member by ID with related data.
   * Roles: Membership_Manager, Director, System_Admin
   */
  get: roleProtectedProcedure(['Membership_Manager', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const member = await ctx.db.enterpriseMember.findUnique({
        where: { id: input.id },
        include: {
          tier: true,
          fees: { orderBy: { year: 'desc' } },
          agreements: { orderBy: { createdAt: 'desc' } },
          groupMemberships: {
            include: { group: { select: { id: true, name: true, type: true, status: true } } },
          },
        },
      })
      if (!member) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Doanh nghiệp hội viên không tồn tại' })
      }
      return member
    }),

  /**
   * Create new enterprise member profile.
   * Roles: Membership_Manager, Director, System_Admin
   */
  create: roleProtectedProcedure(['Membership_Manager', 'Director', 'System_Admin'])
    .input(createMemberInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Validate tier exists
      const tier = await ctx.db.membershipTier.findUnique({
        where: { id: input.membershipTierId },
      })
      if (!tier) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cấp hội viên không tồn tại' })
      }

      // Check unique tax_code if provided
      if (input.taxCode) {
        const existing = await ctx.db.enterpriseMember.findUnique({
          where: { taxCode: input.taxCode },
        })
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Mã số thuế đã tồn tại trong hệ thống' })
        }
      }

      const member = await ctx.db.$transaction(async (tx) => {
        const created = await tx.enterpriseMember.create({
          data: {
            legalNameVi: input.legalNameVi,
            legalNameEn: input.legalNameEn,
            taxCode: input.taxCode,
            businessRegNumber: input.businessRegNumber,
            legalRepresentative: input.legalRepresentative,
            address: input.address,
            website: input.website,
            industrySector: input.industrySector,
            technologyDomains: input.technologyDomains ?? [],
            companySize: input.companySize,
            contactName: input.contactName,
            contactEmail: input.contactEmail,
            contactPhone: input.contactPhone,
            membershipTierId: input.membershipTierId,
            membershipStatus: MembershipStatus.PROSPECT,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'MEMBER_CREATED',
            targetType: 'EnterpriseMember',
            targetId: created.id,
            afterVal: { legalNameVi: input.legalNameVi, tierId: input.membershipTierId },
          },
        })

        return created
      })

      return member
    }),

  /**
   * Update member fields.
   * Roles: Membership_Manager, Director, System_Admin
   */
  update: roleProtectedProcedure(['Membership_Manager', 'Director', 'System_Admin'])
    .input(updateMemberInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id

      const existing = await ctx.db.enterpriseMember.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Doanh nghiệp hội viên không tồn tại' })
      }

      // Validate tier if changing
      if (updateData.membershipTierId) {
        const tier = await ctx.db.membershipTier.findUnique({
          where: { id: updateData.membershipTierId },
        })
        if (!tier) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cấp hội viên không tồn tại' })
        }
      }

      // Check unique tax_code if changing
      if (updateData.taxCode && updateData.taxCode !== existing.taxCode) {
        const duplicate = await ctx.db.enterpriseMember.findUnique({
          where: { taxCode: updateData.taxCode },
        })
        if (duplicate) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Mã số thuế đã tồn tại trong hệ thống' })
        }
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.enterpriseMember.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'MEMBER_UPDATED',
            targetType: 'EnterpriseMember',
            targetId: id,
            beforeVal: { legalNameVi: existing.legalNameVi, tierId: existing.membershipTierId },
            afterVal: updateData,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Submit membership application (enterprise self-service).
   * Any authenticated user can submit an application for a new or existing prospect.
   * Transitions: PROSPECT → APPLICATION_SUBMITTED, INVITED → APPLICATION_SUBMITTED
   */
  submitApplication: protectedProcedure
    .input(z.object({
      memberId: z.string(),
      reasonForJoining: z.string().min(1, 'Lý do tham gia không được để trống'),
      expectedContribution: z.string().optional(),
      desiredTierId: z.string().optional(),
      conflictOfInterestDeclaration: z.boolean().default(false),
      dataProtectionCommitment: z.boolean().default(false),
      codeOfConductAcceptance: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const member = await ctx.db.enterpriseMember.findUnique({ where: { id: input.memberId } })
      if (!member) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Doanh nghiệp không tồn tại' })
      }

      // Validate transition — only PROSPECT and INVITED can submit application
      if (member.membershipStatus !== MembershipStatus.PROSPECT && member.membershipStatus !== MembershipStatus.INVITED) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Không thể nộp đơn. Trạng thái hiện tại: ${member.membershipStatus}. Chỉ có thể nộp đơn khi ở trạng thái PROSPECT hoặc INVITED.`,
        })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.enterpriseMember.update({
          where: { id: input.memberId },
          data: {
            membershipStatus: MembershipStatus.APPLICATION_SUBMITTED,
            membershipTierId: input.desiredTierId ?? member.membershipTierId,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'APPLICATION_SUBMITTED',
            targetType: 'EnterpriseMember',
            targetId: input.memberId,
            beforeVal: { status: member.membershipStatus },
            afterVal: {
              status: MembershipStatus.APPLICATION_SUBMITTED,
              reasonForJoining: input.reasonForJoining,
              expectedContribution: input.expectedContribution,
              conflictOfInterestDeclaration: input.conflictOfInterestDeclaration,
              dataProtectionCommitment: input.dataProtectionCommitment,
              codeOfConductAcceptance: input.codeOfConductAcceptance,
            },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Review application (approve/reject/request more info).
   * Roles: Membership_Manager, Legal_Officer
   * Transitions: APPLICATION_SUBMITTED → UNDER_REVIEW (on start review)
   *              UNDER_REVIEW → APPROVED (approve) or APPLICATION_SUBMITTED (request more info)
   */
  reviewApplication: roleProtectedProcedure(['Membership_Manager', 'Legal_Officer'])
    .input(z.object({
      memberId: z.string(),
      decision: z.enum(['START_REVIEW', 'REQUEST_MORE_INFO', 'RECOMMEND_APPROVAL', 'REJECT']),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const member = await ctx.db.enterpriseMember.findUnique({ where: { id: input.memberId } })
      if (!member) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Doanh nghiệp không tồn tại' })
      }

      let newStatus: MembershipStatus

      switch (input.decision) {
        case 'START_REVIEW':
          if (member.membershipStatus !== MembershipStatus.APPLICATION_SUBMITTED) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Chỉ có thể bắt đầu xem xét khi đơn ở trạng thái APPLICATION_SUBMITTED. Hiện tại: ${member.membershipStatus}`,
            })
          }
          newStatus = MembershipStatus.UNDER_REVIEW
          break

        case 'REQUEST_MORE_INFO':
          if (member.membershipStatus !== MembershipStatus.UNDER_REVIEW) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Chỉ có thể yêu cầu bổ sung khi đang xem xét. Hiện tại: ${member.membershipStatus}`,
            })
          }
          if (!input.comment) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Phải cung cấp lý do khi yêu cầu bổ sung thông tin',
            })
          }
          newStatus = MembershipStatus.APPLICATION_SUBMITTED
          break

        case 'RECOMMEND_APPROVAL':
          if (member.membershipStatus !== MembershipStatus.UNDER_REVIEW) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Chỉ có thể đề xuất phê duyệt khi đang xem xét. Hiện tại: ${member.membershipStatus}`,
            })
          }
          // Stays UNDER_REVIEW — Director will do final approval
          newStatus = MembershipStatus.UNDER_REVIEW
          break

        case 'REJECT':
          if (member.membershipStatus !== MembershipStatus.UNDER_REVIEW) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Chỉ có thể từ chối khi đang xem xét. Hiện tại: ${member.membershipStatus}`,
            })
          }
          if (!input.comment) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Phải cung cấp lý do khi từ chối đơn',
            })
          }
          newStatus = MembershipStatus.TERMINATED
          break

        default:
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Quyết định không hợp lệ' })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.enterpriseMember.update({
          where: { id: input.memberId },
          data: { membershipStatus: newStatus },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: `APPLICATION_${input.decision}`,
            targetType: 'EnterpriseMember',
            targetId: input.memberId,
            beforeVal: { status: member.membershipStatus },
            afterVal: { status: newStatus, comment: input.comment ?? null },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Final approval by Director.
   * Roles: Director, System_Admin
   * Transition: UNDER_REVIEW → APPROVED
   */
  approveApplication: roleProtectedProcedure(['Director', 'System_Admin'])
    .input(z.object({
      memberId: z.string(),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const member = await ctx.db.enterpriseMember.findUnique({ where: { id: input.memberId } })
      if (!member) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Doanh nghiệp không tồn tại' })
      }

      if (member.membershipStatus !== MembershipStatus.UNDER_REVIEW) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Chỉ có thể phê duyệt khi đơn đang ở trạng thái UNDER_REVIEW. Hiện tại: ${member.membershipStatus}`,
        })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.enterpriseMember.update({
          where: { id: input.memberId },
          data: { membershipStatus: MembershipStatus.APPROVED },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'APPLICATION_APPROVED',
            targetType: 'EnterpriseMember',
            targetId: input.memberId,
            beforeVal: { status: member.membershipStatus },
            afterVal: { status: MembershipStatus.APPROVED, comment: input.comment ?? null },
          },
        })

        return result
      })

      return updated
    }),

  // ─── Enterprise User Accounts ─────────────────────────────────────────────

  /**
   * List users belonging to an enterprise.
   * Roles: Enterprise_Admin (own enterprise), Membership_Manager, Director, System_Admin
   */
  listEnterpriseUsers: protectedProcedure
    .input(z.object({ enterpriseId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userRoles = ctx.session!.roles ?? []
      const userId = ctx.session!.user.id

      // Check authorization: System_Admin, Director, Membership_Manager can view any enterprise
      const hasManagerAccess = ['System_Admin', 'Director', 'Membership_Manager'].some(
        (r) => userRoles.includes(r)
      )

      if (!hasManagerAccess) {
        // Enterprise_Admin can only view their own enterprise's users
        if (!userRoles.includes('Enterprise_Admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền xem danh sách người dùng doanh nghiệp này' })
        }
        const isOwnEnterprise = await ctx.db.enterpriseUser.findFirst({
          where: { enterpriseId: input.enterpriseId, userId },
        })
        if (!isOwnEnterprise) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn chỉ có thể xem người dùng của doanh nghiệp mình' })
        }
      }

      const users = await ctx.db.enterpriseUser.findMany({
        where: { enterpriseId: input.enterpriseId },
        orderBy: { id: 'asc' },
      })

      return users
    }),

  /**
   * Add a user to an enterprise (respects tier max_users limit).
   * Roles: Enterprise_Admin (own enterprise), Membership_Manager, Director, System_Admin
   */
  addEnterpriseUser: protectedProcedure
    .input(z.object({
      enterpriseId: z.string().min(1),
      userId: z.string().min(1),
      roleInOrg: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const callerUserId = ctx.session!.user.id
      const userRoles = ctx.session!.roles ?? []

      // Authorization check
      const hasManagerAccess = ['System_Admin', 'Director', 'Membership_Manager'].some(
        (r) => userRoles.includes(r)
      )

      if (!hasManagerAccess) {
        if (!userRoles.includes('Enterprise_Admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền thêm người dùng cho doanh nghiệp này' })
        }
        const isOwnEnterprise = await ctx.db.enterpriseUser.findFirst({
          where: { enterpriseId: input.enterpriseId, userId: callerUserId },
        })
        if (!isOwnEnterprise) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn chỉ có thể quản lý người dùng của doanh nghiệp mình' })
        }
      }

      // Validate enterprise exists and get tier info
      const enterprise = await ctx.db.enterpriseMember.findUnique({
        where: { id: input.enterpriseId },
        include: { tier: { select: { maxUsers: true } } },
      })
      if (!enterprise) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Doanh nghiệp hội viên không tồn tại' })
      }

      // Check max_users limit
      const currentUserCount = await ctx.db.enterpriseUser.count({
        where: { enterpriseId: input.enterpriseId },
      })
      if (currentUserCount >= enterprise.tier.maxUsers) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Đã đạt giới hạn số người dùng (${enterprise.tier.maxUsers}) cho cấp hội viên hiện tại. Vui lòng nâng cấp hội viên để thêm người dùng.`,
        })
      }

      // Check duplicate
      const existing = await ctx.db.enterpriseUser.findUnique({
        where: { enterpriseId_userId: { enterpriseId: input.enterpriseId, userId: input.userId } },
      })
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Người dùng này đã thuộc doanh nghiệp' })
      }

      const created = await ctx.db.$transaction(async (tx) => {
        const enterpriseUser = await tx.enterpriseUser.create({
          data: {
            enterpriseId: input.enterpriseId,
            userId: input.userId,
            roleInOrg: input.roleInOrg ?? null,
          },
        })

        await tx.auditLog.create({
          data: {
            userId: callerUserId,
            action: 'ENTERPRISE_USER_ADDED',
            targetType: 'EnterpriseUser',
            targetId: enterpriseUser.id,
            afterVal: { enterpriseId: input.enterpriseId, userId: input.userId, roleInOrg: input.roleInOrg ?? null },
          },
        })

        return enterpriseUser
      })

      return created
    }),

  /**
   * Remove a user from an enterprise.
   * Roles: Enterprise_Admin (own enterprise), Membership_Manager, Director, System_Admin
   */
  removeEnterpriseUser: protectedProcedure
    .input(z.object({
      enterpriseId: z.string().min(1),
      userId: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const callerUserId = ctx.session!.user.id
      const userRoles = ctx.session!.roles ?? []

      // Authorization check
      const hasManagerAccess = ['System_Admin', 'Director', 'Membership_Manager'].some(
        (r) => userRoles.includes(r)
      )

      if (!hasManagerAccess) {
        if (!userRoles.includes('Enterprise_Admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền xóa người dùng khỏi doanh nghiệp này' })
        }
        const isOwnEnterprise = await ctx.db.enterpriseUser.findFirst({
          where: { enterpriseId: input.enterpriseId, userId: callerUserId },
        })
        if (!isOwnEnterprise) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn chỉ có thể quản lý người dùng của doanh nghiệp mình' })
        }
      }

      // Find the enterprise user record
      const enterpriseUser = await ctx.db.enterpriseUser.findUnique({
        where: { enterpriseId_userId: { enterpriseId: input.enterpriseId, userId: input.userId } },
      })
      if (!enterpriseUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Người dùng không thuộc doanh nghiệp này' })
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.enterpriseUser.delete({
          where: { id: enterpriseUser.id },
        })

        await tx.auditLog.create({
          data: {
            userId: callerUserId,
            action: 'ENTERPRISE_USER_REMOVED',
            targetType: 'EnterpriseUser',
            targetId: enterpriseUser.id,
            beforeVal: { enterpriseId: input.enterpriseId, userId: input.userId, roleInOrg: enterpriseUser.roleInOrg },
          },
        })
      })

      return { success: true }
    }),

  /**
   * Update role_in_org for an enterprise user.
   * Roles: Enterprise_Admin (own enterprise), Membership_Manager, Director, System_Admin
   */
  updateEnterpriseUserRole: protectedProcedure
    .input(z.object({
      enterpriseId: z.string().min(1),
      userId: z.string().min(1),
      roleInOrg: z.string().min(1, 'Vai trò không được để trống'),
    }))
    .mutation(async ({ input, ctx }) => {
      const callerUserId = ctx.session!.user.id
      const userRoles = ctx.session!.roles ?? []

      // Authorization check
      const hasManagerAccess = ['System_Admin', 'Director', 'Membership_Manager'].some(
        (r) => userRoles.includes(r)
      )

      if (!hasManagerAccess) {
        if (!userRoles.includes('Enterprise_Admin')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền thay đổi vai trò người dùng trong doanh nghiệp này' })
        }
        const isOwnEnterprise = await ctx.db.enterpriseUser.findFirst({
          where: { enterpriseId: input.enterpriseId, userId: callerUserId },
        })
        if (!isOwnEnterprise) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn chỉ có thể quản lý người dùng của doanh nghiệp mình' })
        }
      }

      // Find the enterprise user record
      const enterpriseUser = await ctx.db.enterpriseUser.findUnique({
        where: { enterpriseId_userId: { enterpriseId: input.enterpriseId, userId: input.userId } },
      })
      if (!enterpriseUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Người dùng không thuộc doanh nghiệp này' })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.enterpriseUser.update({
          where: { id: enterpriseUser.id },
          data: { roleInOrg: input.roleInOrg },
        })

        await tx.auditLog.create({
          data: {
            userId: callerUserId,
            action: 'ENTERPRISE_USER_ROLE_UPDATED',
            targetType: 'EnterpriseUser',
            targetId: enterpriseUser.id,
            beforeVal: { roleInOrg: enterpriseUser.roleInOrg },
            afterVal: { roleInOrg: input.roleInOrg },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Transition membership status (with validation).
   * Roles: Membership_Manager, Director, System_Admin
   * Validates against the status transition map.
   */
  updateStatus: roleProtectedProcedure(['Membership_Manager', 'Director', 'System_Admin'])
    .input(z.object({
      memberId: z.string(),
      newStatus: membershipStatusEnum,
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const member = await ctx.db.enterpriseMember.findUnique({ where: { id: input.memberId } })
      if (!member) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Doanh nghiệp không tồn tại' })
      }

      if (member.membershipStatus === input.newStatus) {
        return member // No change needed
      }

      if (!isValidTransition(member.membershipStatus, input.newStatus)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Không thể chuyển trạng thái từ ${member.membershipStatus} sang ${input.newStatus}. Các trạng thái hợp lệ: ${VALID_STATUS_TRANSITIONS[member.membershipStatus]?.join(', ') || 'không có'}`,
        })
      }

      // Require fee payment before activating membership (APPROVED → ACTIVE)
      if (input.newStatus === MembershipStatus.ACTIVE && member.membershipStatus === MembershipStatus.APPROVED) {
        const currentYear = new Date().getFullYear()
        const feeRecord = await ctx.db.membershipFee.findFirst({
          where: {
            enterpriseId: input.memberId,
            year: currentYear,
            paymentStatus: { in: ['PAID', 'WAIVED'] },
          },
        })
        if (!feeRecord) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Không thể kích hoạt hội viên. Phí thường niên chưa được thanh toán hoặc miễn giảm.',
          })
        }
      }

      // Set joinedDate when transitioning to ACTIVE for the first time
      const additionalData: Record<string, unknown> = {}
      if (input.newStatus === MembershipStatus.ACTIVE && !member.joinedDate) {
        additionalData.joinedDate = new Date()
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.enterpriseMember.update({
          where: { id: input.memberId },
          data: {
            membershipStatus: input.newStatus,
            ...additionalData,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'MEMBER_STATUS_CHANGED',
            targetType: 'EnterpriseMember',
            targetId: input.memberId,
            beforeVal: { status: member.membershipStatus },
            afterVal: { status: input.newStatus, reason: input.reason ?? null },
          },
        })

        // Auto-remove/suspend group memberships when enterprise is suspended or terminated (R14)
        if (input.newStatus === MembershipStatus.SUSPENDED) {
          await suspendEnterpriseGroupMemberships(tx, input.memberId, input.reason, userId)
        } else if (input.newStatus === MembershipStatus.TERMINATED) {
          await removeEnterpriseGroupMemberships(tx, input.memberId, input.reason, userId)
        }

        return result
      })

      return updated
    }),
})
