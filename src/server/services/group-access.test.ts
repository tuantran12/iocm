import { describe, it, expect, vi } from 'vitest'
import { GroupVisibility, GroupMemberStatus } from '@prisma/client'
import {
  buildVisibilityFilter,
  canViewGroup,
  validateMembershipPolicy,
  type GroupAccessContext,
} from './group-access'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockDb(overrides: Record<string, unknown> = {}) {
  return {
    enterpriseUser: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  }
}

function makeCtx(userId: string, roles: string[], db?: any): GroupAccessContext {
  return { userId, roles, db: db ?? mockDb() }
}

// ─── buildVisibilityFilter ────────────────────────────────────────────────────

describe('buildVisibilityFilter', () => {
  it('returns null for System_Admin (bypass)', async () => {
    const ctx = makeCtx('admin-1', ['System_Admin'])
    const result = await buildVisibilityFilter(ctx)
    expect(result).toBeNull()
  })

  it('returns null for Director (bypass)', async () => {
    const ctx = makeCtx('dir-1', ['Director'])
    const result = await buildVisibilityFilter(ctx)
    expect(result).toBeNull()
  })

  it('includes PUBLIC_TO_MEMBERS for any authenticated user', async () => {
    const ctx = makeCtx('user-1', ['Enterprise_Member'])
    const result = await buildVisibilityFilter(ctx)
    expect(result).not.toBeNull()
    const visibilities = result!.OR.map((c: any) => c.visibility)
    expect(visibilities).toContain(GroupVisibility.PUBLIC_TO_MEMBERS)
  })

  it('includes PRIVATE_INVITE_ONLY with membership check', async () => {
    const ctx = makeCtx('user-1', ['Enterprise_Member'])
    const result = await buildVisibilityFilter(ctx)
    const privateCondition = result!.OR.find(
      (c: any) => c.visibility === GroupVisibility.PRIVATE_INVITE_ONLY,
    ) as any
    expect(privateCondition).toBeDefined()
    expect(privateCondition.members.some.userId).toBe('user-1')
    expect(privateCondition.members.some.status).toBe(GroupMemberStatus.ACTIVE)
  })

  it('includes CORE_ONLY only for Core_Team_Member role', async () => {
    const ctxWithRole = makeCtx('user-1', ['Core_Team_Member'])
    const result = await buildVisibilityFilter(ctxWithRole)
    const coreCondition = result!.OR.find(
      (c: any) => c.visibility === GroupVisibility.CORE_ONLY,
    )
    expect(coreCondition).toBeDefined()

    const ctxWithout = makeCtx('user-2', ['Enterprise_Member'])
    const result2 = await buildVisibilityFilter(ctxWithout)
    const coreCondition2 = result2!.OR.find(
      (c: any) => c.visibility === GroupVisibility.CORE_ONLY,
    )
    expect(coreCondition2).toBeUndefined()
  })

  it('includes COUNCIL_ONLY only for Council roles', async () => {
    const ctxChair = makeCtx('user-1', ['Council_Chair'])
    const result = await buildVisibilityFilter(ctxChair)
    const councilCondition = result!.OR.find(
      (c: any) => c.visibility === GroupVisibility.COUNCIL_ONLY,
    )
    expect(councilCondition).toBeDefined()

    const ctxMember = makeCtx('user-2', ['Council_Member'])
    const result2 = await buildVisibilityFilter(ctxMember)
    const councilCondition2 = result2!.OR.find(
      (c: any) => c.visibility === GroupVisibility.COUNCIL_ONLY,
    )
    expect(councilCondition2).toBeDefined()

    const ctxRegular = makeCtx('user-3', ['Enterprise_Member'])
    const result3 = await buildVisibilityFilter(ctxRegular)
    const councilCondition3 = result3!.OR.find(
      (c: any) => c.visibility === GroupVisibility.COUNCIL_ONLY,
    )
    expect(councilCondition3).toBeUndefined()
  })

  it('includes ENTERPRISE_PRIVATE when user has enterprise membership', async () => {
    const db = mockDb({
      enterpriseUser: {
        findMany: vi.fn().mockResolvedValue([{ enterpriseId: 'ent-1' }]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    })
    const ctx = makeCtx('user-1', ['Enterprise_Member'], db)
    const result = await buildVisibilityFilter(ctx)
    const entCondition = result!.OR.find(
      (c: any) => c.visibility === GroupVisibility.ENTERPRISE_PRIVATE,
    ) as any
    expect(entCondition).toBeDefined()
    expect(entCondition.members.some.enterpriseId.in).toContain('ent-1')
  })

  it('excludes ENTERPRISE_PRIVATE when user has no enterprise', async () => {
    const ctx = makeCtx('user-1', ['Viewer'])
    const result = await buildVisibilityFilter(ctx)
    const entCondition = result!.OR.find(
      (c: any) => c.visibility === GroupVisibility.ENTERPRISE_PRIVATE,
    )
    expect(entCondition).toBeUndefined()
  })
})

// ─── canViewGroup ─────────────────────────────────────────────────────────────

describe('canViewGroup', () => {
  const baseGroup = {
    id: 'group-1',
    visibility: GroupVisibility.PUBLIC_TO_MEMBERS,
    members: [
      { userId: 'member-1', status: GroupMemberStatus.ACTIVE, enterpriseId: null },
    ],
  }

  it('allows System_Admin to view any group', async () => {
    const ctx = makeCtx('admin-1', ['System_Admin'])
    const group = { ...baseGroup, visibility: GroupVisibility.CORE_ONLY }
    expect(await canViewGroup(ctx, group)).toBe(true)
  })

  it('allows any authenticated user to view PUBLIC_TO_MEMBERS', async () => {
    const ctx = makeCtx('random-user', ['Viewer'])
    expect(await canViewGroup(ctx, baseGroup)).toBe(true)
  })

  it('allows group member to view PRIVATE_INVITE_ONLY', async () => {
    const ctx = makeCtx('member-1', ['Enterprise_Member'])
    const group = { ...baseGroup, visibility: GroupVisibility.PRIVATE_INVITE_ONLY }
    expect(await canViewGroup(ctx, group)).toBe(true)
  })

  it('denies non-member from viewing PRIVATE_INVITE_ONLY', async () => {
    const ctx = makeCtx('outsider', ['Enterprise_Member'])
    const group = { ...baseGroup, visibility: GroupVisibility.PRIVATE_INVITE_ONLY }
    expect(await canViewGroup(ctx, group)).toBe(false)
  })

  it('allows Core_Team_Member to view CORE_ONLY', async () => {
    const ctx = makeCtx('core-user', ['Core_Team_Member'])
    const group = { ...baseGroup, visibility: GroupVisibility.CORE_ONLY }
    expect(await canViewGroup(ctx, group)).toBe(true)
  })

  it('denies non-core user from viewing CORE_ONLY', async () => {
    const ctx = makeCtx('regular', ['Enterprise_Member'])
    const group = { ...baseGroup, visibility: GroupVisibility.CORE_ONLY }
    expect(await canViewGroup(ctx, group)).toBe(false)
  })

  it('allows Council_Chair to view COUNCIL_ONLY', async () => {
    const ctx = makeCtx('chair', ['Council_Chair'])
    const group = { ...baseGroup, visibility: GroupVisibility.COUNCIL_ONLY }
    expect(await canViewGroup(ctx, group)).toBe(true)
  })

  it('denies non-council user from viewing COUNCIL_ONLY', async () => {
    const ctx = makeCtx('regular', ['Enterprise_Member'])
    const group = { ...baseGroup, visibility: GroupVisibility.COUNCIL_ONLY }
    expect(await canViewGroup(ctx, group)).toBe(false)
  })

  it('allows group member to view PROJECT_ONLY', async () => {
    const ctx = makeCtx('member-1', ['Project_Manager'])
    const group = { ...baseGroup, visibility: GroupVisibility.PROJECT_ONLY }
    expect(await canViewGroup(ctx, group)).toBe(true)
  })

  it('denies non-member from viewing PROJECT_ONLY', async () => {
    const ctx = makeCtx('outsider', ['Project_Manager'])
    const group = { ...baseGroup, visibility: GroupVisibility.PROJECT_ONLY }
    expect(await canViewGroup(ctx, group)).toBe(false)
  })

  it('allows enterprise member to view ENTERPRISE_PRIVATE', async () => {
    const db = mockDb({
      enterpriseUser: {
        findMany: vi.fn().mockResolvedValue([{ enterpriseId: 'ent-1' }]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    })
    const ctx = makeCtx('ent-user', ['Enterprise_Member'], db)
    const group = {
      id: 'group-1',
      visibility: GroupVisibility.ENTERPRISE_PRIVATE,
      members: [
        { userId: 'other-user', status: GroupMemberStatus.ACTIVE, enterpriseId: 'ent-1' },
      ],
    }
    expect(await canViewGroup(ctx, group)).toBe(true)
  })

  it('denies user from different enterprise viewing ENTERPRISE_PRIVATE', async () => {
    const db = mockDb({
      enterpriseUser: {
        findMany: vi.fn().mockResolvedValue([{ enterpriseId: 'ent-2' }]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    })
    const ctx = makeCtx('ent-user', ['Enterprise_Member'], db)
    const group = {
      id: 'group-1',
      visibility: GroupVisibility.ENTERPRISE_PRIVATE,
      members: [
        { userId: 'other-user', status: GroupMemberStatus.ACTIVE, enterpriseId: 'ent-1' },
      ],
    }
    expect(await canViewGroup(ctx, group)).toBe(false)
  })
})

// ─── validateMembershipPolicy ─────────────────────────────────────────────────

describe('validateMembershipPolicy', () => {
  const baseGroup = {
    id: 'group-1',
    membershipPolicy: 'open',
    visibility: GroupVisibility.PUBLIC_TO_MEMBERS,
  }

  it('open policy: allows anyone, returns ACTIVE status', async () => {
    const ctx = makeCtx('user-1', ['Viewer'])
    const result = await validateMembershipPolicy(ctx, baseGroup, 'target-user', false)
    expect(result.allowed).toBe(true)
    expect(result.status).toBe(GroupMemberStatus.ACTIVE)
  })

  it('approval_required: owner inviting → ACTIVE', async () => {
    const group = { ...baseGroup, membershipPolicy: 'approval_required' }
    const ctx = makeCtx('owner-1', ['Director'])
    const result = await validateMembershipPolicy(ctx, group, 'target-user', true)
    expect(result.allowed).toBe(true)
    expect(result.status).toBe(GroupMemberStatus.ACTIVE)
  })

  it('approval_required: regular user → SUSPENDED (pending)', async () => {
    const group = { ...baseGroup, membershipPolicy: 'approval_required' }
    const ctx = makeCtx('user-1', ['Enterprise_Member'])
    const result = await validateMembershipPolicy(ctx, group, 'target-user', false)
    expect(result.allowed).toBe(true)
    expect(result.status).toBe(GroupMemberStatus.SUSPENDED)
  })

  it('invite_only: denies non-owner/moderator', async () => {
    const group = { ...baseGroup, membershipPolicy: 'invite_only' }
    const ctx = makeCtx('user-1', ['Enterprise_Member'])
    const result = await validateMembershipPolicy(ctx, group, 'target-user', false)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('invite_only: allows owner/moderator', async () => {
    const group = { ...baseGroup, membershipPolicy: 'invite_only' }
    const ctx = makeCtx('owner-1', ['Director'])
    const result = await validateMembershipPolicy(ctx, group, 'target-user', true)
    expect(result.allowed).toBe(true)
    expect(result.status).toBe(GroupMemberStatus.ACTIVE)
  })

  it('tier_restricted: denies when user has no enterprise', async () => {
    const group = { ...baseGroup, membershipPolicy: 'tier_restricted' }
    const db = mockDb({
      enterpriseUser: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    })
    const ctx = makeCtx('owner-1', ['Director'], db)
    const result = await validateMembershipPolicy(ctx, group, 'target-user', true)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('cấp hội viên')
  })

  it('tier_restricted: allows when user has active enterprise with tier', async () => {
    const group = { ...baseGroup, membershipPolicy: 'tier_restricted' }
    const db = mockDb({
      enterpriseUser: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          enterprise: {
            membershipStatus: 'ACTIVE',
            tier: { id: 'tier-1', name: 'Standard' },
          },
        }),
      },
    })
    const ctx = makeCtx('owner-1', ['Director'], db)
    const result = await validateMembershipPolicy(ctx, group, 'target-user', true)
    expect(result.allowed).toBe(true)
    expect(result.status).toBe(GroupMemberStatus.ACTIVE)
  })

  it('tier_restricted: denies non-owner/moderator regardless of tier', async () => {
    const group = { ...baseGroup, membershipPolicy: 'tier_restricted' }
    const ctx = makeCtx('user-1', ['Enterprise_Member'])
    const result = await validateMembershipPolicy(ctx, group, 'target-user', false)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('cấp hội viên')
  })

  it('tier_restricted: denies when enterprise membership is not ACTIVE', async () => {
    const group = { ...baseGroup, membershipPolicy: 'tier_restricted' }
    const db = mockDb({
      enterpriseUser: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          enterprise: {
            membershipStatus: 'SUSPENDED',
            tier: { id: 'tier-1', name: 'Standard' },
          },
        }),
      },
    })
    const ctx = makeCtx('owner-1', ['Director'], db)
    const result = await validateMembershipPolicy(ctx, group, 'target-user', true)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('cấp hội viên')
  })

  it('tier_restricted: denies when enterprise has no tier assigned', async () => {
    const group = { ...baseGroup, membershipPolicy: 'tier_restricted' }
    const db = mockDb({
      enterpriseUser: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          enterprise: {
            membershipStatus: 'ACTIVE',
            tier: null,
          },
        }),
      },
    })
    const ctx = makeCtx('owner-1', ['Director'], db)
    const result = await validateMembershipPolicy(ctx, group, 'target-user', true)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('cấp hội viên')
  })

  it('role_restricted: denies non-owner/moderator', async () => {
    const group = { ...baseGroup, membershipPolicy: 'role_restricted' }
    const ctx = makeCtx('user-1', ['Enterprise_Member'])
    const result = await validateMembershipPolicy(ctx, group, 'target-user', false)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('vai trò')
  })

  it('role_restricted: allows owner/moderator to invite', async () => {
    const group = { ...baseGroup, membershipPolicy: 'role_restricted' }
    const db = mockDb({
      userRole: {
        findMany: vi.fn().mockResolvedValue([{ role: { name: 'Project_Manager' } }]),
      },
    })
    const ctx = makeCtx('owner-1', ['Director'], db)
    const result = await validateMembershipPolicy(ctx, group, 'target-user', true)
    expect(result.allowed).toBe(true)
    expect(result.status).toBe(GroupMemberStatus.ACTIVE)
  })
})
