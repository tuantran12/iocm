import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GroupType, GroupVisibility, GroupRole, GroupMemberStatus, GroupStatus } from '@prisma/client'
import { TRPCError } from '@trpc/server'

/**
 * Groups Router - CRUD & Membership Tests
 *
 * Tests group CRUD operations and membership management.
 * Validates: Requirements R12 (Working Group Management), R14 (Group Membership & Permissions)
 */

// ─── Mock Prisma & Context Helpers ────────────────────────────────────────────

function createMockTx() {
  return {
    workingGroup: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    groupMembership: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

function createMockDb() {
  const tx = createMockTx()
  return {
    workingGroup: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    groupMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    enterpriseUser: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx)),
  }
}

type MockDb = ReturnType<typeof createMockDb>

// ─── Extracted Business Logic (mirrors router logic for testability) ──────────

async function isGroupOwnerOrModerator(
  db: MockDb,
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

interface CreateGroupInput {
  name: string
  type: GroupType
  description?: string | null
  goal: string
  visibility?: GroupVisibility
  membershipPolicy?: string
}

async function createGroup(db: MockDb, input: CreateGroupInput, userId: string) {
  const group = await db.$transaction(async (tx) => {
    const created = await tx.workingGroup.create({
      data: {
        name: input.name,
        type: input.type,
        description: input.description ?? null,
        goal: input.goal,
        ownerId: userId,
        visibility: input.visibility ?? GroupVisibility.PRIVATE_INVITE_ONLY,
        membershipPolicy: input.membershipPolicy ?? 'invite_only',
        status: GroupStatus.ACTIVE,
      },
    })

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
}

interface UpdateGroupInput {
  id: string
  name?: string
  type?: GroupType
  description?: string | null
  goal?: string
  visibility?: GroupVisibility
  membershipPolicy?: string
  status?: GroupStatus
}

async function updateGroup(
  db: MockDb,
  input: UpdateGroupInput,
  userId: string,
  userRoles: string[],
) {
  const { id, ...updateData } = input

  const existing = await db.workingGroup.findUnique({ where: { id } })
  if (!existing) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Nhóm làm việc không tồn tại' })
  }

  const hasAdminAccess = ['System_Admin', 'Director'].some((r) => userRoles.includes(r))
  if (!hasAdminAccess) {
    const hasGroupAccess = await isGroupOwnerOrModerator(db, id, userId)
    if (!hasGroupAccess) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền cập nhật nhóm này' })
    }
  }

  const updated = await db.$transaction(async (tx) => {
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
        beforeVal: { name: (existing as any).name, status: (existing as any).status },
        afterVal: updateData,
      },
    })

    return result
  })

  return updated
}

interface InviteMemberInput {
  groupId: string
  userId: string
  enterpriseId?: string
  groupRole?: GroupRole
}

async function inviteMember(
  db: MockDb,
  input: InviteMemberInput,
  callerId: string,
  userRoles: string[],
) {
  const group = await db.workingGroup.findUnique({ where: { id: input.groupId } })
  if (!group) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Nhóm làm việc không tồn tại' })
  }

  // Check if user is already a member (duplicate prevention)
  const existingMembership = await db.groupMembership.findFirst({
    where: {
      groupId: input.groupId,
      userId: input.userId,
      status: { in: [GroupMemberStatus.ACTIVE, GroupMemberStatus.SUSPENDED] },
    },
  })
  if (existingMembership) {
    if ((existingMembership as any).status === GroupMemberStatus.ACTIVE) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Người dùng đã là thành viên của nhóm' })
    }
    if ((existingMembership as any).status === GroupMemberStatus.SUSPENDED) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Người dùng đang chờ phê duyệt tham gia nhóm' })
    }
  }

  const hasAdminAccess = ['System_Admin', 'Director'].some((r) => userRoles.includes(r))
  const hasGroupAccess = hasAdminAccess || await isGroupOwnerOrModerator(db, input.groupId, callerId)

  // For invite_only policy, only owner/moderator can invite
  const policy = (group as any).membershipPolicy
  if (policy === 'invite_only' && !hasGroupAccess) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Nhóm này chỉ cho phép chủ nhóm hoặc moderator mời thành viên',
    })
  }

  // Determine status based on policy
  let memberStatus = GroupMemberStatus.ACTIVE
  if (policy === 'approval_required' && !hasGroupAccess) {
    memberStatus = GroupMemberStatus.SUSPENDED
  }

  const membership = await db.$transaction(async (tx) => {
    const created = await tx.groupMembership.create({
      data: {
        groupId: input.groupId,
        userId: input.userId,
        enterpriseId: input.enterpriseId ?? null,
        groupRole: input.groupRole ?? GroupRole.MEMBER,
        invitedBy: callerId,
        status: memberStatus,
      },
    })

    await tx.auditLog.create({
      data: {
        userId: callerId,
        action: memberStatus === GroupMemberStatus.ACTIVE ? 'GROUP_MEMBER_INVITED' : 'GROUP_MEMBER_PENDING',
        targetType: 'GroupMembership',
        targetId: created.id,
        afterVal: {
          groupId: input.groupId,
          userId: input.userId,
          role: input.groupRole ?? 'MEMBER',
          status: memberStatus,
          policy,
        },
      },
    })

    return created
  })

  return membership
}

async function approveMember(
  db: MockDb,
  membershipId: string,
  callerId: string,
  userRoles: string[],
) {
  const membership = await db.groupMembership.findUnique({ where: { id: membershipId } })
  if (!membership) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Yêu cầu tham gia nhóm không tồn tại' })
  }

  if ((membership as any).status === GroupMemberStatus.ACTIVE) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Thành viên đã được phê duyệt' })
  }

  const hasAdminAccess = ['System_Admin', 'Director'].some((r) => userRoles.includes(r))
  if (!hasAdminAccess) {
    const hasGroupAccess = await isGroupOwnerOrModerator(db, (membership as any).groupId, callerId)
    if (!hasGroupAccess) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền phê duyệt thành viên nhóm này' })
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.groupMembership.update({
      where: { id: membershipId },
      data: { status: GroupMemberStatus.ACTIVE },
    })

    await tx.auditLog.create({
      data: {
        userId: callerId,
        action: 'GROUP_MEMBER_APPROVED',
        targetType: 'GroupMembership',
        targetId: membershipId,
        afterVal: { groupId: (membership as any).groupId, userId: (membership as any).userId, status: 'ACTIVE' },
      },
    })

    return result
  })

  return updated
}

async function removeMember(
  db: MockDb,
  groupId: string,
  targetUserId: string,
  callerId: string,
  userRoles: string[],
) {
  const group = await db.workingGroup.findUnique({ where: { id: groupId } })
  if (!group) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Nhóm làm việc không tồn tại' })
  }

  const hasAdminAccess = ['System_Admin', 'Director'].some((r) => userRoles.includes(r))
  if (!hasAdminAccess) {
    const hasGroupAccess = await isGroupOwnerOrModerator(db, groupId, callerId)
    if (!hasGroupAccess) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền xóa thành viên khỏi nhóm này' })
    }
  }

  // Cannot remove the group owner
  if (targetUserId === (group as any).ownerId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Không thể xóa chủ sở hữu nhóm' })
  }

  const membership = await db.groupMembership.findFirst({
    where: { groupId, userId: targetUserId, status: GroupMemberStatus.ACTIVE },
  })
  if (!membership) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Người dùng không phải thành viên hoạt động của nhóm' })
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.groupMembership.update({
      where: { id: (membership as any).id },
      data: { status: GroupMemberStatus.REMOVED },
    })

    await tx.auditLog.create({
      data: {
        userId: callerId,
        action: 'GROUP_MEMBER_REMOVED',
        targetType: 'GroupMembership',
        targetId: (membership as any).id,
        beforeVal: { groupId, userId: targetUserId, status: 'ACTIVE' },
        afterVal: { status: 'REMOVED' },
      },
    })

    return result
  })

  return updated
}

async function updateMemberRole(
  db: MockDb,
  groupId: string,
  targetUserId: string,
  newRole: GroupRole,
  callerId: string,
  userRoles: string[],
) {
  const group = await db.workingGroup.findUnique({ where: { id: groupId } })
  if (!group) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Nhóm làm việc không tồn tại' })
  }

  const hasAdminAccess = ['System_Admin', 'Director'].some((r) => userRoles.includes(r))
  if (!hasAdminAccess) {
    const hasGroupAccess = await isGroupOwnerOrModerator(db, groupId, callerId)
    if (!hasGroupAccess) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền thay đổi vai trò thành viên nhóm' })
    }
  }

  // Cannot change owner role
  if (targetUserId === (group as any).ownerId && newRole !== GroupRole.OWNER) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Không thể thay đổi vai trò chủ sở hữu nhóm qua thao tác này' })
  }

  const membership = await db.groupMembership.findFirst({
    where: { groupId, userId: targetUserId, status: GroupMemberStatus.ACTIVE },
  })
  if (!membership) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Người dùng không phải thành viên hoạt động của nhóm' })
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.groupMembership.update({
      where: { id: (membership as any).id },
      data: { groupRole: newRole },
    })

    await tx.auditLog.create({
      data: {
        userId: callerId,
        action: 'GROUP_MEMBER_ROLE_UPDATED',
        targetType: 'GroupMembership',
        targetId: (membership as any).id,
        beforeVal: { groupRole: (membership as any).groupRole },
        afterVal: { groupRole: newRole },
      },
    })

    return result
  })

  return updated
}


// ─── Tests: Group CRUD ────────────────────────────────────────────────────────

describe('Groups Router - CRUD', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('creates a group with default visibility and policy', async () => {
      const txMock = createMockTx()
      txMock.workingGroup.create.mockResolvedValue({
        id: 'group-new',
        name: 'Nhóm AI Ethics',
        type: GroupType.TECHNOLOGY_DOMAIN,
        goal: 'Nghiên cứu AI Ethics',
        ownerId: 'user-1',
        visibility: GroupVisibility.PRIVATE_INVITE_ONLY,
        membershipPolicy: 'invite_only',
        status: GroupStatus.ACTIVE,
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await createGroup(
        mockDb,
        { name: 'Nhóm AI Ethics', type: GroupType.TECHNOLOGY_DOMAIN, goal: 'Nghiên cứu AI Ethics' },
        'user-1',
      )

      expect(txMock.workingGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Nhóm AI Ethics',
          type: GroupType.TECHNOLOGY_DOMAIN,
          goal: 'Nghiên cứu AI Ethics',
          ownerId: 'user-1',
          visibility: GroupVisibility.PRIVATE_INVITE_ONLY,
          membershipPolicy: 'invite_only',
          status: GroupStatus.ACTIVE,
        }),
      })
      expect(result.id).toBe('group-new')
    })

    it('auto-adds creator as OWNER member', async () => {
      const txMock = createMockTx()
      txMock.workingGroup.create.mockResolvedValue({ id: 'group-new' })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      await createGroup(
        mockDb,
        { name: 'Test Group', type: GroupType.PROJECT, goal: 'Test goal' },
        'creator-1',
      )

      expect(txMock.groupMembership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          groupId: 'group-new',
          userId: 'creator-1',
          groupRole: GroupRole.OWNER,
          status: GroupMemberStatus.ACTIVE,
        }),
      })
    })

    it('creates audit log on group creation', async () => {
      const txMock = createMockTx()
      txMock.workingGroup.create.mockResolvedValue({ id: 'group-new' })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      await createGroup(
        mockDb,
        { name: 'Audit Group', type: GroupType.CORE, goal: 'Goal', visibility: GroupVisibility.CORE_ONLY },
        'admin-1',
      )

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin-1',
          action: 'GROUP_CREATED',
          targetType: 'WorkingGroup',
          targetId: 'group-new',
        }),
      })
    })

    it('uses custom visibility and policy when provided', async () => {
      const txMock = createMockTx()
      txMock.workingGroup.create.mockResolvedValue({ id: 'group-new' })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      await createGroup(
        mockDb,
        {
          name: 'Open Group',
          type: GroupType.COMMUNITY_IMPLEMENTATION,
          goal: 'Community',
          visibility: GroupVisibility.PUBLIC_TO_MEMBERS,
          membershipPolicy: 'open',
        },
        'user-1',
      )

      expect(txMock.workingGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          visibility: GroupVisibility.PUBLIC_TO_MEMBERS,
          membershipPolicy: 'open',
        }),
      })
    })
  })

  describe('update', () => {
    it('allows System_Admin to update any group', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        name: 'Old Name',
        status: GroupStatus.ACTIVE,
      })
      const txMock = createMockTx()
      txMock.workingGroup.update.mockResolvedValue({ id: 'group-1', name: 'New Name' })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await updateGroup(
        mockDb,
        { id: 'group-1', name: 'New Name' },
        'admin-1',
        ['System_Admin'],
      )

      expect(txMock.workingGroup.update).toHaveBeenCalledWith({
        where: { id: 'group-1' },
        data: { name: 'New Name' },
      })
      expect(result.name).toBe('New Name')
    })

    it('allows group owner/moderator to update', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        name: 'Old Name',
        status: GroupStatus.ACTIVE,
      })
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-1',
        groupRole: GroupRole.OWNER,
        status: GroupMemberStatus.ACTIVE,
      })
      const txMock = createMockTx()
      txMock.workingGroup.update.mockResolvedValue({ id: 'group-1', goal: 'Updated goal' })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await updateGroup(
        mockDb,
        { id: 'group-1', goal: 'Updated goal' },
        'owner-1',
        ['Enterprise_Member'],
      )

      expect(result.goal).toBe('Updated goal')
    })

    it('throws NOT_FOUND when group does not exist', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue(null)

      await expect(
        updateGroup(mockDb, { id: 'nonexistent', name: 'X' }, 'user-1', ['System_Admin']),
      ).rejects.toThrow('Nhóm làm việc không tồn tại')
    })

    it('throws FORBIDDEN when non-admin non-owner tries to update', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        name: 'Name',
        status: GroupStatus.ACTIVE,
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null) // not owner/mod

      await expect(
        updateGroup(mockDb, { id: 'group-1', name: 'Hack' }, 'random-user', ['Viewer']),
      ).rejects.toThrow('Bạn không có quyền cập nhật nhóm này')
    })
  })
})


// ─── Tests: Membership Operations ────────────────────────────────────────────

describe('Groups Router - Membership', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('inviteMember', () => {
    it('invites a user to an open group with ACTIVE status', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        membershipPolicy: 'open',
        ownerId: 'owner-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null) // no existing membership

      const txMock = createMockTx()
      txMock.groupMembership.create.mockResolvedValue({
        id: 'gm-new',
        groupId: 'group-1',
        userId: 'target-user',
        groupRole: GroupRole.MEMBER,
        status: GroupMemberStatus.ACTIVE,
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await inviteMember(
        mockDb,
        { groupId: 'group-1', userId: 'target-user' },
        'caller-1',
        ['Enterprise_Member'],
      )

      expect(txMock.groupMembership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          groupId: 'group-1',
          userId: 'target-user',
          groupRole: GroupRole.MEMBER,
          status: GroupMemberStatus.ACTIVE,
        }),
      })
      expect(result.status).toBe(GroupMemberStatus.ACTIVE)
    })

    it('creates pending membership for approval_required group (non-owner caller)', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        membershipPolicy: 'approval_required',
        ownerId: 'owner-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null)

      const txMock = createMockTx()
      txMock.groupMembership.create.mockResolvedValue({
        id: 'gm-new',
        status: GroupMemberStatus.SUSPENDED,
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await inviteMember(
        mockDb,
        { groupId: 'group-1', userId: 'target-user' },
        'regular-user',
        ['Enterprise_Member'],
      )

      expect(txMock.groupMembership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: GroupMemberStatus.SUSPENDED,
        }),
      })
      expect(result.status).toBe(GroupMemberStatus.SUSPENDED)
    })

    it('throws CONFLICT when user is already an active member (duplicate prevention)', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        membershipPolicy: 'open',
        ownerId: 'owner-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-existing',
        status: GroupMemberStatus.ACTIVE,
      })

      await expect(
        inviteMember(
          mockDb,
          { groupId: 'group-1', userId: 'already-member' },
          'caller-1',
          ['Enterprise_Member'],
        ),
      ).rejects.toThrow('Người dùng đã là thành viên của nhóm')
    })

    it('throws CONFLICT when user has pending membership (duplicate prevention)', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        membershipPolicy: 'approval_required',
        ownerId: 'owner-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-pending',
        status: GroupMemberStatus.SUSPENDED,
      })

      await expect(
        inviteMember(
          mockDb,
          { groupId: 'group-1', userId: 'pending-user' },
          'caller-1',
          ['Enterprise_Member'],
        ),
      ).rejects.toThrow('Người dùng đang chờ phê duyệt tham gia nhóm')
    })

    it('throws FORBIDDEN for invite_only group when caller is not owner/moderator', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        membershipPolicy: 'invite_only',
        ownerId: 'owner-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null) // not existing + not owner/mod

      await expect(
        inviteMember(
          mockDb,
          { groupId: 'group-1', userId: 'target-user' },
          'random-user',
          ['Enterprise_Member'],
        ),
      ).rejects.toThrow('Nhóm này chỉ cho phép chủ nhóm hoặc moderator mời thành viên')
    })

    it('throws NOT_FOUND when group does not exist', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue(null)

      await expect(
        inviteMember(
          mockDb,
          { groupId: 'nonexistent', userId: 'target-user' },
          'caller-1',
          ['Director'],
        ),
      ).rejects.toThrow('Nhóm làm việc không tồn tại')
    })

    it('creates audit log with correct action on invite', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        membershipPolicy: 'open',
        ownerId: 'owner-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null)

      const txMock = createMockTx()
      txMock.groupMembership.create.mockResolvedValue({ id: 'gm-new' })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      await inviteMember(
        mockDb,
        { groupId: 'group-1', userId: 'target-user' },
        'caller-1',
        ['Enterprise_Member'],
      )

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'caller-1',
          action: 'GROUP_MEMBER_INVITED',
          targetType: 'GroupMembership',
        }),
      })
    })
  })

  describe('approveMember', () => {
    it('approves pending membership (sets status to ACTIVE)', async () => {
      mockDb.groupMembership.findUnique.mockResolvedValue({
        id: 'gm-1',
        groupId: 'group-1',
        userId: 'target-user',
        status: GroupMemberStatus.SUSPENDED,
      })
      // Caller is owner
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-owner',
        groupRole: GroupRole.OWNER,
        status: GroupMemberStatus.ACTIVE,
      })

      const txMock = createMockTx()
      txMock.groupMembership.update.mockResolvedValue({
        id: 'gm-1',
        status: GroupMemberStatus.ACTIVE,
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await approveMember(mockDb, 'gm-1', 'owner-1', ['Enterprise_Member'])

      expect(txMock.groupMembership.update).toHaveBeenCalledWith({
        where: { id: 'gm-1' },
        data: { status: GroupMemberStatus.ACTIVE },
      })
      expect(result.status).toBe(GroupMemberStatus.ACTIVE)
    })

    it('throws NOT_FOUND when membership does not exist', async () => {
      mockDb.groupMembership.findUnique.mockResolvedValue(null)

      await expect(
        approveMember(mockDb, 'nonexistent', 'caller-1', ['Director']),
      ).rejects.toThrow('Yêu cầu tham gia nhóm không tồn tại')
    })

    it('throws BAD_REQUEST when member is already active', async () => {
      mockDb.groupMembership.findUnique.mockResolvedValue({
        id: 'gm-1',
        groupId: 'group-1',
        userId: 'target-user',
        status: GroupMemberStatus.ACTIVE,
      })

      await expect(
        approveMember(mockDb, 'gm-1', 'owner-1', ['Director']),
      ).rejects.toThrow('Thành viên đã được phê duyệt')
    })

    it('throws FORBIDDEN when caller is not owner/moderator/admin', async () => {
      mockDb.groupMembership.findUnique.mockResolvedValue({
        id: 'gm-1',
        groupId: 'group-1',
        userId: 'target-user',
        status: GroupMemberStatus.SUSPENDED,
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null) // not owner/mod

      await expect(
        approveMember(mockDb, 'gm-1', 'random-user', ['Viewer']),
      ).rejects.toThrow('Bạn không có quyền phê duyệt thành viên nhóm này')
    })
  })

  describe('removeMember', () => {
    it('removes an active member from the group', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        ownerId: 'owner-1',
      })
      // Caller is admin
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-target',
        groupId: 'group-1',
        userId: 'target-user',
        status: GroupMemberStatus.ACTIVE,
      })

      const txMock = createMockTx()
      txMock.groupMembership.update.mockResolvedValue({
        id: 'gm-target',
        status: GroupMemberStatus.REMOVED,
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await removeMember(mockDb, 'group-1', 'target-user', 'admin-1', ['System_Admin'])

      expect(txMock.groupMembership.update).toHaveBeenCalledWith({
        where: { id: 'gm-target' },
        data: { status: GroupMemberStatus.REMOVED },
      })
      expect(result.status).toBe(GroupMemberStatus.REMOVED)
    })

    it('throws BAD_REQUEST when trying to remove group owner', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        ownerId: 'owner-1',
      })

      await expect(
        removeMember(mockDb, 'group-1', 'owner-1', 'admin-1', ['System_Admin']),
      ).rejects.toThrow('Không thể xóa chủ sở hữu nhóm')
    })

    it('throws NOT_FOUND when group does not exist', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue(null)

      await expect(
        removeMember(mockDb, 'nonexistent', 'target-user', 'admin-1', ['System_Admin']),
      ).rejects.toThrow('Nhóm làm việc không tồn tại')
    })

    it('throws NOT_FOUND when user is not an active member', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        ownerId: 'owner-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null) // no active membership

      await expect(
        removeMember(mockDb, 'group-1', 'not-a-member', 'admin-1', ['System_Admin']),
      ).rejects.toThrow('Người dùng không phải thành viên hoạt động của nhóm')
    })

    it('throws FORBIDDEN when caller lacks permission', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        ownerId: 'owner-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null) // not owner/mod

      await expect(
        removeMember(mockDb, 'group-1', 'target-user', 'random-user', ['Viewer']),
      ).rejects.toThrow('Bạn không có quyền xóa thành viên khỏi nhóm này')
    })
  })

  describe('updateMemberRole', () => {
    it('updates member role to MODERATOR', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        ownerId: 'owner-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-target',
        groupId: 'group-1',
        userId: 'target-user',
        groupRole: GroupRole.MEMBER,
        status: GroupMemberStatus.ACTIVE,
      })

      const txMock = createMockTx()
      txMock.groupMembership.update.mockResolvedValue({
        id: 'gm-target',
        groupRole: GroupRole.MODERATOR,
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await updateMemberRole(
        mockDb, 'group-1', 'target-user', GroupRole.MODERATOR, 'admin-1', ['Director'],
      )

      expect(txMock.groupMembership.update).toHaveBeenCalledWith({
        where: { id: 'gm-target' },
        data: { groupRole: GroupRole.MODERATOR },
      })
      expect(result.groupRole).toBe(GroupRole.MODERATOR)
    })

    it('throws BAD_REQUEST when trying to change owner role', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        ownerId: 'owner-1',
      })

      await expect(
        updateMemberRole(
          mockDb, 'group-1', 'owner-1', GroupRole.MEMBER, 'admin-1', ['System_Admin'],
        ),
      ).rejects.toThrow('Không thể thay đổi vai trò chủ sở hữu nhóm')
    })

    it('throws NOT_FOUND when group does not exist', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue(null)

      await expect(
        updateMemberRole(
          mockDb, 'nonexistent', 'target-user', GroupRole.MODERATOR, 'admin-1', ['System_Admin'],
        ),
      ).rejects.toThrow('Nhóm làm việc không tồn tại')
    })

    it('throws NOT_FOUND when user is not an active member', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        ownerId: 'owner-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null)

      await expect(
        updateMemberRole(
          mockDb, 'group-1', 'not-member', GroupRole.MODERATOR, 'admin-1', ['System_Admin'],
        ),
      ).rejects.toThrow('Người dùng không phải thành viên hoạt động của nhóm')
    })

    it('throws FORBIDDEN when caller lacks permission', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        ownerId: 'owner-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null) // not owner/mod

      await expect(
        updateMemberRole(
          mockDb, 'group-1', 'target-user', GroupRole.MODERATOR, 'random-user', ['Viewer'],
        ),
      ).rejects.toThrow('Bạn không có quyền thay đổi vai trò thành viên nhóm')
    })

    it('creates audit log with role change details', async () => {
      mockDb.workingGroup.findUnique.mockResolvedValue({
        id: 'group-1',
        ownerId: 'owner-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-target',
        groupId: 'group-1',
        userId: 'target-user',
        groupRole: GroupRole.MEMBER,
        status: GroupMemberStatus.ACTIVE,
      })

      const txMock = createMockTx()
      txMock.groupMembership.update.mockResolvedValue({ id: 'gm-target', groupRole: GroupRole.MODERATOR })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      await updateMemberRole(
        mockDb, 'group-1', 'target-user', GroupRole.MODERATOR, 'admin-1', ['Director'],
      )

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin-1',
          action: 'GROUP_MEMBER_ROLE_UPDATED',
          beforeVal: { groupRole: GroupRole.MEMBER },
          afterVal: { groupRole: GroupRole.MODERATOR },
        }),
      })
    })
  })
})
