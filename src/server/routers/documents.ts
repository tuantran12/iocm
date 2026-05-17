import { z } from 'zod'
import { DocumentCluster, DocumentStatus, Confidentiality, Priority } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure, protectedProcedure, roleProtectedProcedure } from '../trpc'
import {
  COMPLETENESS_QUESTIONS,
  calculateCompletenessScore,
  getMissingActions,
  canMarkAsOfficialRecord,
  type CheckAnswer,
} from '../completeness'
import { validateStatusTransition } from '../document-status'

const documentClusterEnum = z.nativeEnum(DocumentCluster)
const documentStatusEnum = z.nativeEnum(DocumentStatus)
const confidentialityEnum = z.nativeEnum(Confidentiality)
const priorityEnum = z.nativeEnum(Priority)

const checkAnswerEnum = z.enum(['PASS', 'FAIL', 'NOT_APPLICABLE'])

export const documentsRouter = router({
  list: protectedProcedure
    .input(z.object({
      // Filters
      cluster: documentClusterEnum.optional(),
      status: documentStatusEnum.optional(),
      priority: priorityEnum.optional(),
      ownerId: z.string().optional(),
      deadlineBefore: z.date().optional(),
      deadlineAfter: z.date().optional(),
      approvalStatus: z.enum(['PENDING_APPROVAL', 'APPROVED', 'IN_REVIEW']).optional(),
      // Search
      search: z.string().optional(),
      // Sort
      sortField: z.string().optional(),
      sortDirection: z.enum(['asc', 'desc']).optional(),
      // Pagination
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const {
        cluster,
        status,
        priority,
        ownerId,
        deadlineBefore,
        deadlineAfter,
        approvalStatus,
        search,
        sortField = 'createdAt',
        sortDirection = 'desc',
        page = 0,
        pageSize = 25,
      } = input ?? {}

      // Build where clause
      const where: Record<string, unknown> = {}

      if (cluster) where.cluster = cluster
      if (status) where.status = status
      if (priority) where.priority = priority
      if (ownerId) where.ownerId = ownerId

      if (deadlineBefore || deadlineAfter) {
        const deadlineFilter: Record<string, Date> = {}
        if (deadlineBefore) deadlineFilter.lte = deadlineBefore
        if (deadlineAfter) deadlineFilter.gte = deadlineAfter
        where.deadline = deadlineFilter
      }

      // approvalStatus filter maps to specific DocumentStatus values
      if (approvalStatus && !status) {
        where.status = approvalStatus as DocumentStatus
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ]
      }

      // Build orderBy
      const orderBy: Record<string, string> = {}
      const allowedSortFields = [
        'code', 'name', 'cluster', 'type', 'status',
        'completenessScore', 'priority', 'deadline', 'createdAt', 'updatedAt',
      ]
      if (sortField && allowedSortFields.includes(sortField)) {
        orderBy[sortField] = sortDirection ?? 'desc'
      } else {
        orderBy.createdAt = 'desc'
      }

      const [items, total] = await Promise.all([
        ctx.db.documentItem.findMany({
          where,
          orderBy,
          skip: page * pageSize,
          take: pageSize,
          include: {
            checks: { select: { passed: true } },
          },
        }),
        ctx.db.documentItem.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const document = await ctx.db.documentItem.findUnique({
        where: { id: input.id },
        include: {
          checks: true,
          legalBases: { include: { legalBasis: true } },
          versions: { orderBy: { version: 'desc' } },
          comments: {
            include: { author: { select: { id: true, name: true, avatarUrl: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tài liệu không tồn tại' })
      }
      return document
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1, 'Tên tài liệu không được để trống'),
      type: z.string(),
      cluster: documentClusterEnum,
      priority: priorityEnum.optional(),
      confidentiality: confidentialityEnum.optional(),
      deadline: z.date().optional().nullable(),
      effectiveDate: z.date().optional().nullable(),
      expiryDate: z.date().optional().nullable(),
      riskIfMissing: z.string().optional().nullable(),
      ownerId: z.string().optional().nullable(),
      reviewerId: z.string().optional().nullable(),
      approverId: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Auto-generate document code: DOC-YYYYMMDD-XXXX
      const now = new Date()
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
      const count = await ctx.db.documentItem.count()
      const code = `DOC-${dateStr}-${String(count + 1).padStart(4, '0')}`

      // Create document and initialize 8 completeness checks in a transaction
      const document = await ctx.db.$transaction(async (tx) => {
        const doc = await tx.documentItem.create({ data: { ...input, code } })

        // Initialize 8 CompletenessCheck records
        await tx.completenessCheck.createMany({
          data: COMPLETENESS_QUESTIONS.map((q) => ({
            documentId: doc.id,
            question: q.key,
            answer: null,
            passed: false,
          })),
        })

        // Audit log for document creation
        await tx.auditLog.create({
          data: {
            userId,
            action: 'DOCUMENT_CREATED',
            targetType: 'DocumentItem',
            targetId: doc.id,
            afterVal: { code, name: input.name, type: input.type, cluster: input.cluster },
          },
        })

        return doc
      })

      return document
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: documentStatusEnum }))
    .mutation(async ({ input, ctx }) => {
      const document = await ctx.db.documentItem.findUnique({
        where: { id: input.id },
      })
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tài liệu không tồn tại' })
      }

      const userRoles = ctx.session.roles ?? []
      const validation = validateStatusTransition(document.status, input.status, userRoles)

      if (!validation.valid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'message' in validation ? validation.message : 'Chuyển trạng thái không hợp lệ' })
      }

      // Same status — no change needed
      if (document.status === input.status) {
        return document
      }

      const updated = await ctx.db.documentItem.update({
        where: { id: input.id },
        data: { status: input.status },
      })

      // Audit log for status change
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: 'DOCUMENT_STATUS_CHANGED',
          targetType: 'DocumentItem',
          targetId: input.id,
          beforeVal: { status: document.status },
          afterVal: { status: input.status },
        },
      })

      return updated
    }),

  /**
   * Get completeness checks for a document.
   * Returns the 8 checks with their status, score, and missing actions.
   */
  getCompleteness: publicProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ input, ctx }) => {
      const checks = await ctx.db.completenessCheck.findMany({
        where: { documentId: input.documentId },
        orderBy: { question: 'asc' },
      })

      const score = calculateCompletenessScore(checks)
      const missingActions = getMissingActions(checks)
      const officialRecordCheck = canMarkAsOfficialRecord(checks)

      // Enrich checks with question metadata
      const enrichedChecks = checks.map((check) => {
        const questionDef = COMPLETENESS_QUESTIONS.find((q) => q.key === check.question)
        return {
          id: check.id,
          documentId: check.documentId,
          key: check.question,
          questionText: questionDef?.question ?? check.question,
          answer: check.answer as CheckAnswer | null,
          passed: check.passed,
          required: questionDef?.required ?? false,
          missingAction: !check.passed && check.answer !== 'NOT_APPLICABLE'
            ? questionDef?.missingAction ?? null
            : null,
          updatedBy: check.updatedBy,
          updatedAt: check.updatedAt,
        }
      })

      return {
        checks: enrichedChecks,
        score,
        missingActions,
        canMarkOfficialRecord: officialRecordCheck.allowed,
        officialRecordBlockers: officialRecordCheck.blockers,
      }
    }),

  /**
   * Update completeness check answers for a document.
   * Recalculates and persists completeness_score on DocumentItem.
   */
  updateCompleteness: publicProcedure
    .input(z.object({
      documentId: z.string(),
      updates: z.array(z.object({
        questionKey: z.string(),
        answer: checkAnswerEnum,
      })),
      updatedBy: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { documentId, updates, updatedBy } = input

      // Validate document exists
      const document = await ctx.db.documentItem.findUnique({
        where: { id: documentId },
      })
      if (!document) {
        throw new Error('Tài liệu không tồn tại')
      }

      // Update each check in a transaction
      const result = await ctx.db.$transaction(async (tx) => {
        // Update individual checks
        for (const update of updates) {
          const passed = update.answer === 'PASS'

          await tx.completenessCheck.updateMany({
            where: {
              documentId,
              question: update.questionKey,
            },
            data: {
              answer: update.answer,
              passed,
              updatedBy: updatedBy ?? null,
            },
          })
        }

        // Fetch all checks after update to recalculate score
        const allChecks = await tx.completenessCheck.findMany({
          where: { documentId },
        })

        const score = calculateCompletenessScore(allChecks)

        // Update completeness_score on DocumentItem
        await tx.documentItem.update({
          where: { id: documentId },
          data: { completenessScore: score },
        })

        const missingActions = getMissingActions(allChecks)
        const officialRecordCheck = canMarkAsOfficialRecord(allChecks)

        return {
          score,
          missingActions,
          canMarkOfficialRecord: officialRecordCheck.allowed,
          officialRecordBlockers: officialRecordCheck.blockers,
        }
      })

      return result
    }),

  /**
   * Mark a document as official_record (APPROVED status).
   * Prevents marking if required completeness questions are not passed.
   */
  markOfficialRecord: publicProcedure
    .input(z.object({ documentId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const checks = await ctx.db.completenessCheck.findMany({
        where: { documentId: input.documentId },
      })

      const { allowed, blockers } = canMarkAsOfficialRecord(checks)

      if (!allowed) {
        throw new Error(
          `Không thể đánh dấu tài liệu là bản gốc chính thức. Các câu hỏi chưa đạt: ${blockers.join('; ')}`
        )
      }

      return ctx.db.documentItem.update({
        where: { id: input.documentId },
        data: { status: DocumentStatus.APPROVED },
      })
    }),

  /**
   * Update a document with automatic versioning.
   * Creates a DocumentVersion snapshot of the current state before applying changes.
   * Uses a transaction to ensure atomicity.
   */
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      type: z.string().optional(),
      cluster: documentClusterEnum.optional(),
      status: documentStatusEnum.optional(),
      confidentiality: confidentialityEnum.optional(),
      priority: priorityEnum.optional(),
      deadline: z.date().optional().nullable(),
      effectiveDate: z.date().optional().nullable(),
      expiryDate: z.date().optional().nullable(),
      riskIfMissing: z.string().optional().nullable(),
      fileUrl: z.string().optional().nullable(),
      ownerId: z.string().optional().nullable(),
      reviewerId: z.string().optional().nullable(),
      approverId: z.string().optional().nullable(),
      changeNote: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, changeNote, ...updateData } = input
      const userId = ctx.session.user.id

      // Fetch current document state (snapshot before update)
      const current = await ctx.db.documentItem.findUnique({ where: { id } })
      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tài liệu không tồn tại' })
      }

      // Use transaction: create version snapshot + update document atomically
      const result = await ctx.db.$transaction(async (tx) => {
        // Create version snapshot of current state
        await tx.documentVersion.create({
          data: {
            documentId: id,
            version: current.version,
            content: JSON.stringify({
              name: current.name,
              type: current.type,
              cluster: current.cluster,
              status: current.status,
              confidentiality: current.confidentiality,
              priority: current.priority,
              deadline: current.deadline,
              effectiveDate: current.effectiveDate,
              expiryDate: current.expiryDate,
              riskIfMissing: current.riskIfMissing,
              ownerId: current.ownerId,
              reviewerId: current.reviewerId,
              approverId: current.approverId,
            }),
            fileUrl: current.fileUrl,
            changedBy: userId,
            changeNote: changeNote ?? null,
          },
        })

        // Update document and increment version
        const updated = await tx.documentItem.update({
          where: { id },
          data: {
            ...updateData,
            version: { increment: 1 },
          },
        })

        return updated
      })

      return result
    }),

  /**
   * List all versions of a document, ordered by version descending (newest first).
   */
  listVersions: publicProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.documentVersion.findMany({
        where: { documentId: input.documentId },
        orderBy: { version: 'desc' },
      })
    }),

  /**
   * Get a specific version of a document by version number.
   */
  getVersion: publicProcedure
    .input(z.object({ documentId: z.string(), version: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const version = await ctx.db.documentVersion.findFirst({
        where: {
          documentId: input.documentId,
          version: input.version,
        },
      })
      if (!version) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Phiên bản ${input.version} không tồn tại cho tài liệu này`,
        })
      }
      return version
    }),

  /**
   * Submit a document for review.
   * Owner submits → status changes to IN_REVIEW, assigns reviewer.
   * Only the document owner (or any user if no owner set) can submit.
   */
  submitForReview: protectedProcedure
    .input(z.object({
      documentId: z.string(),
      reviewerId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { documentId, reviewerId } = input
      const userId = ctx.session.user.id

      const document = await ctx.db.documentItem.findUnique({ where: { id: documentId } })
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tài liệu không tồn tại' })
      }

      // Only owner can submit for review
      if (document.ownerId && document.ownerId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Chỉ người sở hữu tài liệu mới có thể gửi để xem xét',
        })
      }

      // Document must be in DRAFTING or NEEDS_INFO status to submit for review
      if (document.status !== DocumentStatus.DRAFTING && document.status !== DocumentStatus.NEEDS_INFO) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Không thể gửi xem xét. Tài liệu phải ở trạng thái "Đang soạn thảo" hoặc "Cần bổ sung". Trạng thái hiện tại: ${document.status}`,
        })
      }

      // Verify reviewer exists
      const reviewer = await ctx.db.user.findUnique({ where: { id: reviewerId } })
      if (!reviewer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Người xem xét không tồn tại trong hệ thống' })
      }

      // Reviewer cannot be the same as owner
      if (reviewerId === userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Người xem xét không được trùng với người gửi',
        })
      }

      const result = await ctx.db.$transaction(async (tx) => {
        const updated = await tx.documentItem.update({
          where: { id: documentId },
          data: {
            status: DocumentStatus.IN_REVIEW,
            reviewerId,
          },
        })

        // Create audit log
        await tx.auditLog.create({
          data: {
            userId,
            action: 'SUBMIT_FOR_REVIEW',
            targetType: 'DocumentItem',
            targetId: documentId,
            beforeVal: { status: document.status, reviewerId: document.reviewerId },
            afterVal: { status: DocumentStatus.IN_REVIEW, reviewerId },
          },
        })

        return updated
      })

      return result
    }),

  /**
   * Review a document.
   * Only the assigned reviewer can perform this action.
   * Approve → status moves to PENDING_APPROVAL, assigns approver.
   * Reject → status back to DRAFTING with comment.
   */
  review: protectedProcedure
    .input(z.object({
      documentId: z.string(),
      decision: z.enum(['APPROVE', 'REJECT']),
      approverId: z.string().optional(),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { documentId, decision, approverId, comment } = input
      const userId = ctx.session.user.id

      const document = await ctx.db.documentItem.findUnique({ where: { id: documentId } })
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tài liệu không tồn tại' })
      }

      // Document must be IN_REVIEW
      if (document.status !== DocumentStatus.IN_REVIEW) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Tài liệu không ở trạng thái "Đang xem xét". Trạng thái hiện tại: ${document.status}`,
        })
      }

      // Only assigned reviewer can review
      if (document.reviewerId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Chỉ người được chỉ định xem xét mới có thể thực hiện thao tác này',
        })
      }

      if (decision === 'APPROVE') {
        // Must provide approverId when approving
        if (!approverId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Phải chỉ định người phê duyệt khi đồng ý xem xét',
          })
        }

        // Verify approver exists
        const approver = await ctx.db.user.findUnique({ where: { id: approverId } })
        if (!approver) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Người phê duyệt không tồn tại trong hệ thống' })
        }

        // Approver cannot be the reviewer
        if (approverId === userId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Người phê duyệt không được trùng với người xem xét',
          })
        }

        const result = await ctx.db.$transaction(async (tx) => {
          const updated = await tx.documentItem.update({
            where: { id: documentId },
            data: {
              status: DocumentStatus.PENDING_APPROVAL,
              approverId,
            },
          })

          await tx.auditLog.create({
            data: {
              userId,
              action: 'REVIEW_APPROVE',
              targetType: 'DocumentItem',
              targetId: documentId,
              beforeVal: { status: document.status, approverId: document.approverId },
              afterVal: { status: DocumentStatus.PENDING_APPROVAL, approverId, comment: comment ?? null },
            },
          })

          return updated
        })

        return result
      } else {
        // REJECT → back to DRAFTING
        if (!comment) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Phải cung cấp lý do khi từ chối tài liệu',
          })
        }

        const result = await ctx.db.$transaction(async (tx) => {
          const updated = await tx.documentItem.update({
            where: { id: documentId },
            data: {
              status: DocumentStatus.DRAFTING,
            },
          })

          await tx.auditLog.create({
            data: {
              userId,
              action: 'REVIEW_REJECT',
              targetType: 'DocumentItem',
              targetId: documentId,
              beforeVal: { status: document.status },
              afterVal: { status: DocumentStatus.DRAFTING, comment },
            },
          })

          return updated
        })

        return result
      }
    }),

  /**
   * Approve or reject a document (final approval step).
   * Only the assigned approver can perform this action.
   * Approve → status → APPROVED.
   * Reject → status back to DRAFTING with comment.
   */
  approve: protectedProcedure
    .input(z.object({
      documentId: z.string(),
      decision: z.enum(['APPROVE', 'REJECT']),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { documentId, decision, comment } = input
      const userId = ctx.session.user.id

      const document = await ctx.db.documentItem.findUnique({ where: { id: documentId } })
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tài liệu không tồn tại' })
      }

      // Document must be PENDING_APPROVAL
      if (document.status !== DocumentStatus.PENDING_APPROVAL) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Tài liệu không ở trạng thái "Chờ phê duyệt". Trạng thái hiện tại: ${document.status}`,
        })
      }

      // Only assigned approver can approve
      if (document.approverId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Chỉ người được chỉ định phê duyệt mới có thể thực hiện thao tác này',
        })
      }

      if (decision === 'APPROVE') {
        const result = await ctx.db.$transaction(async (tx) => {
          const updated = await tx.documentItem.update({
            where: { id: documentId },
            data: {
              status: DocumentStatus.APPROVED,
            },
          })

          await tx.auditLog.create({
            data: {
              userId,
              action: 'APPROVE_DOCUMENT',
              targetType: 'DocumentItem',
              targetId: documentId,
              beforeVal: { status: document.status },
              afterVal: { status: DocumentStatus.APPROVED, comment: comment ?? null },
            },
          })

          return updated
        })

        return result
      } else {
        // REJECT → back to DRAFTING
        if (!comment) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Phải cung cấp lý do khi từ chối phê duyệt tài liệu',
          })
        }

        const result = await ctx.db.$transaction(async (tx) => {
          const updated = await tx.documentItem.update({
            where: { id: documentId },
            data: {
              status: DocumentStatus.DRAFTING,
            },
          })

          await tx.auditLog.create({
            data: {
              userId,
              action: 'REJECT_DOCUMENT',
              targetType: 'DocumentItem',
              targetId: documentId,
              beforeVal: { status: document.status },
              afterVal: { status: DocumentStatus.DRAFTING, comment },
            },
          })

          return updated
        })

        return result
      }
    }),

  // ─── Document Comments ─────────────────────────────────────────────────────

  /**
   * Danh sách bình luận của tài liệu.
   * Trả về tất cả bình luận kèm thông tin tác giả (tên, avatar) và threading.
   */
  listComments: publicProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ input, ctx }) => {
      const comments = await ctx.db.documentComment.findMany({
        where: { documentId: input.documentId },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
      return comments
    }),

  /**
   * Thêm bình luận vào tài liệu. Hỗ trợ trả lời (threading) qua replyToId.
   */
  addComment: protectedProcedure
    .input(z.object({
      documentId: z.string(),
      content: z.string().min(1, 'Nội dung bình luận không được để trống'),
      replyToId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Validate document exists
      const document = await ctx.db.documentItem.findUnique({
        where: { id: input.documentId },
      })
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tài liệu không tồn tại' })
      }

      // Validate replyToId if provided
      if (input.replyToId) {
        const parentComment = await ctx.db.documentComment.findUnique({
          where: { id: input.replyToId },
        })
        if (!parentComment) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Bình luận gốc không tồn tại' })
        }
        if (parentComment.documentId !== input.documentId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Bình luận gốc không thuộc tài liệu này' })
        }
      }

      const comment = await ctx.db.documentComment.create({
        data: {
          documentId: input.documentId,
          authorId: userId,
          content: input.content,
          replyToId: input.replyToId ?? null,
        },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      })

      return comment
    }),

  /**
   * Sửa bình luận. Chỉ tác giả mới được sửa bình luận của mình.
   */
  editComment: protectedProcedure
    .input(z.object({
      commentId: z.string(),
      content: z.string().min(1, 'Nội dung bình luận không được để trống'),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const comment = await ctx.db.documentComment.findUnique({
        where: { id: input.commentId },
      })
      if (!comment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bình luận không tồn tại' })
      }

      // Only the author can edit their own comment
      if (comment.authorId !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn chỉ có thể sửa bình luận của mình' })
      }

      const updated = await ctx.db.documentComment.update({
        where: { id: input.commentId },
        data: { content: input.content },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      })

      return updated
    }),

  /**
   * Xóa bình luận.
   * Tác giả có thể xóa bình luận của mình.
   * Admin (System_Admin, Director) hoặc chủ tài liệu có thể xóa bất kỳ bình luận nào.
   */
  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const comment = await ctx.db.documentComment.findUnique({
        where: { id: input.commentId },
        include: { document: { select: { ownerId: true } } },
      })
      if (!comment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bình luận không tồn tại' })
      }

      // Allow delete if: author, System_Admin, Director, or document owner
      const isAuthor = comment.authorId === userId
      const isAdmin = userRoles.includes('System_Admin') || userRoles.includes('Director')
      const isDocOwner = comment.document.ownerId === userId

      if (!isAuthor && !isAdmin && !isDocOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không có quyền xóa bình luận này',
        })
      }

      await ctx.db.documentComment.delete({ where: { id: input.commentId } })

      return { success: true }
    }),

  /**
   * Soft delete (archive) a document.
   * Changes status to ARCHIVED. Only Director and System_Admin can perform this action.
   * Creates an audit log entry.
   */
  delete: roleProtectedProcedure(['Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const document = await ctx.db.documentItem.findUnique({
        where: { id: input.id },
      })
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tài liệu không tồn tại' })
      }

      // Already archived
      if (document.status === DocumentStatus.ARCHIVED) {
        return document
      }

      const result = await ctx.db.$transaction(async (tx) => {
        const archived = await tx.documentItem.update({
          where: { id: input.id },
          data: { status: DocumentStatus.ARCHIVED },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'DOCUMENT_DELETED',
            targetType: 'DocumentItem',
            targetId: input.id,
            beforeVal: { status: document.status, name: document.name, code: document.code },
            afterVal: { status: DocumentStatus.ARCHIVED },
          },
        })

        return archived
      })

      return result
    }),
})
