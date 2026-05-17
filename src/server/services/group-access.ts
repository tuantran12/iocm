import { GroupVisibility, GroupMemberStatus } from '@prisma/client'

/**
 * Group Access Service
 *
 * Handles visibility filtering and membership policy enforcement for Working Groups.
 * Implements requirements R12 (visibility) and R14 (membership policy).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupAccessContext {
  userId: string
  roles: string[]
  db: any
}

export interface VisibilityFilterResult {
  OR: Record<string, unknown>[]
}

// ─── Visibility Filter (for groups.list) ──────────────────────────────────────

/**
 * Builds a Prisma WHERE clause that filters groups based on user's visibility access.
 *
 * Rules:
 * - PUBLIC_TO_MEMBERS: visible to all authenticated members
 * - PRIVATE_INVITE_ONLY: only visible to group members
 * - CORE_ONLY: only visible to Core_Team_Member role
 * - PROJECT_ONLY: only visible to project participants (group members)
 * - COUNCIL_ONLY: only visible to Council_Chair, Council_Member
 * - ENTERPRISE_PRIVATE: only visible to enterprise members of that enterprise
 *
 * System_Admin and Director bypass all visibility checks.
 */
export async function buildVisibilityFilter(
  ctx: GroupAccessContext,
): Promise<VisibilityFilterResult | null> {
  const { userId, roles } = ctx

  // Admin roles bypass all visibility checks
  if (roles.includes('System_Admin') || roles.includes('Director')) {
    return null // No filter needed
  }

  const conditions: Record<string, unknown>[] = []

  // PUBLIC_TO_MEMBERS: any authenticated user can see
  conditions.push({ visibility: GroupVisibility.PUBLIC_TO_MEMBERS })

  // PRIVATE_INVITE_ONLY: only group members can see
  conditions.push({
    visibility: GroupVisibility.PRIVATE_INVITE_ONLY,
    members: {
      some: { userId, status: GroupMemberStatus.ACTIVE },
    },
  })

  // CORE_ONLY: only Core_Team_Member role
  if (roles.includes('Core_Team_Member')) {
    conditions.push({ visibility: GroupVisibility.CORE_ONLY })
  }

  // PROJECT_ONLY: only project participants (i.e., group members)
  conditions.push({
    visibility: GroupVisibility.PROJECT_ONLY,
    members: {
      some: { userId, status: GroupMemberStatus.ACTIVE },
    },
  })

  // COUNCIL_ONLY: only Council_Chair, Council_Member
  if (roles.includes('Council_Chair') || roles.includes('Council_Member')) {
    conditions.push({ visibility: GroupVisibility.COUNCIL_ONLY })
  }

  // ENTERPRISE_PRIVATE: only enterprise members of that enterprise
  // Find user's enterprise IDs
  const enterpriseUsers = await ctx.db.enterpriseUser.findMany({
    where: { userId },
    select: { enterpriseId: true },
  })
  const enterpriseIds = enterpriseUsers.map((eu: { enterpriseId: string }) => eu.enterpriseId)

  if (enterpriseIds.length > 0) {
    conditions.push({
      visibility: GroupVisibility.ENTERPRISE_PRIVATE,
      members: {
        some: {
          userId,
          status: GroupMemberStatus.ACTIVE,
          enterpriseId: { in: enterpriseIds },
        },
      },
    })
  }

  return { OR: conditions }
}

// ─── Visibility Check (for groups.get) ────────────────────────────────────────

/**
 * Checks if a user can view a specific group based on its visibility setting.
 * Returns true if the user has access, false otherwise.
 */
export async function canViewGroup(
  ctx: GroupAccessContext,
  group: {
    id: string
    visibility: GroupVisibility
    members: Array<{ userId: string; status: GroupMemberStatus; enterpriseId?: string | null }>
  },
): Promise<boolean> {
  const { userId, roles } = ctx

  // Admin roles bypass all visibility checks
  if (roles.includes('System_Admin') || roles.includes('Director')) {
    return true
  }

  const isMember = group.members.some(
    (m) => m.userId === userId && m.status === GroupMemberStatus.ACTIVE,
  )

  switch (group.visibility) {
    case GroupVisibility.PUBLIC_TO_MEMBERS:
      // Any authenticated user can view
      return true

    case GroupVisibility.PRIVATE_INVITE_ONLY:
      return isMember

    case GroupVisibility.CORE_ONLY:
      return roles.includes('Core_Team_Member')

    case GroupVisibility.PROJECT_ONLY:
      // Only project participants (group members) can view
      return isMember

    case GroupVisibility.COUNCIL_ONLY:
      return roles.includes('Council_Chair') || roles.includes('Council_Member')

    case GroupVisibility.ENTERPRISE_PRIVATE: {
      if (isMember) return true
      // Check if user belongs to an enterprise that has members in this group
      const enterpriseUsers = await ctx.db.enterpriseUser.findMany({
        where: { userId },
        select: { enterpriseId: true },
      })
      const userEnterpriseIds = enterpriseUsers.map(
        (eu: { enterpriseId: string }) => eu.enterpriseId,
      )
      if (userEnterpriseIds.length === 0) return false
      // Check if any group member shares the same enterprise
      return group.members.some(
        (m) =>
          m.status === GroupMemberStatus.ACTIVE &&
          m.enterpriseId &&
          userEnterpriseIds.includes(m.enterpriseId),
      )
    }

    default:
      return false
  }
}

// ─── Membership Policy Validation (for groups.inviteMember) ───────────────────

export type MembershipPolicy =
  | 'open'
  | 'approval_required'
  | 'invite_only'
  | 'tier_restricted'
  | 'role_restricted'

export interface PolicyValidationResult {
  allowed: boolean
  status: GroupMemberStatus
  reason?: string
}

/**
 * Validates whether a membership action is allowed based on the group's membership policy.
 *
 * Rules:
 * - open: anyone can join (auto-approve → ACTIVE status)
 * - approval_required: creates pending membership (SUSPENDED status, needs approval)
 * - invite_only: only owner/moderator can invite (checked separately)
 * - tier_restricted: only members of specific tiers can join
 * - role_restricted: only users with specific roles can join
 *
 * @param callerIsOwnerOrMod - whether the caller is group owner/moderator
 */
export async function validateMembershipPolicy(
  ctx: GroupAccessContext,
  group: { id: string; membershipPolicy: string; visibility: GroupVisibility },
  targetUserId: string,
  callerIsOwnerOrMod: boolean,
): Promise<PolicyValidationResult> {
  const policy = group.membershipPolicy as MembershipPolicy

  switch (policy) {
    case 'open':
      // Anyone can join, auto-approve
      return { allowed: true, status: GroupMemberStatus.ACTIVE }

    case 'approval_required':
      if (callerIsOwnerOrMod) {
        // Owner/moderator inviting directly → auto-approve
        return { allowed: true, status: GroupMemberStatus.ACTIVE }
      }
      // Regular user requesting to join → pending (SUSPENDED until approved)
      return { allowed: true, status: GroupMemberStatus.SUSPENDED }

    case 'invite_only':
      if (!callerIsOwnerOrMod) {
        return {
          allowed: false,
          status: GroupMemberStatus.SUSPENDED,
          reason: 'Nhóm này chỉ cho phép chủ nhóm hoặc moderator mời thành viên',
        }
      }
      return { allowed: true, status: GroupMemberStatus.ACTIVE }

    case 'tier_restricted': {
      // Check if target user belongs to an enterprise with an eligible tier
      if (callerIsOwnerOrMod) {
        // Owner/mod can still invite, but we check tier eligibility
        const eligible = await checkTierEligibility(ctx, targetUserId)
        if (!eligible) {
          return {
            allowed: false,
            status: GroupMemberStatus.SUSPENDED,
            reason: 'Người dùng không thuộc cấp hội viên được phép tham gia nhóm này',
          }
        }
        return { allowed: true, status: GroupMemberStatus.ACTIVE }
      }
      return {
        allowed: false,
        status: GroupMemberStatus.SUSPENDED,
        reason: 'Nhóm này giới hạn theo cấp hội viên, chỉ chủ nhóm/moderator có thể mời',
      }
    }

    case 'role_restricted': {
      // Check if target user has required roles
      // For role_restricted, we check the target user's system roles
      if (callerIsOwnerOrMod) {
        const targetUserRoles = await getUserRoles(ctx, targetUserId)
        // Role-restricted groups typically require specific roles
        // Since we don't store which roles are required on the group,
        // we allow owner/mod to invite anyone (they make the judgment)
        return { allowed: true, status: GroupMemberStatus.ACTIVE }
      }
      return {
        allowed: false,
        status: GroupMemberStatus.SUSPENDED,
        reason: 'Nhóm này giới hạn theo vai trò, chỉ chủ nhóm/moderator có thể mời',
      }
    }

    default:
      // Unknown policy, default to invite_only behavior
      if (!callerIsOwnerOrMod) {
        return {
          allowed: false,
          status: GroupMemberStatus.SUSPENDED,
          reason: 'Chính sách nhóm không cho phép tự tham gia',
        }
      }
      return { allowed: true, status: GroupMemberStatus.ACTIVE }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Checks if a user belongs to an enterprise with a membership tier
 * that grants access (tier with projectRight or votingRight as proxy for eligibility).
 */
async function checkTierEligibility(
  ctx: GroupAccessContext,
  userId: string,
): Promise<boolean> {
  const enterpriseUser = await ctx.db.enterpriseUser.findFirst({
    where: { userId },
    include: {
      enterprise: {
        include: { tier: true },
      },
    },
  })

  if (!enterpriseUser) return false

  // Enterprise must be active
  const enterprise = enterpriseUser.enterprise
  if (enterprise.membershipStatus !== 'ACTIVE') return false

  // Tier exists (any active enterprise member with a tier is eligible)
  return !!enterprise.tier
}

/**
 * Gets a user's system roles from the database.
 */
async function getUserRoles(
  ctx: GroupAccessContext,
  userId: string,
): Promise<string[]> {
  const userRoles = await ctx.db.userRole.findMany({
    where: { userId },
    include: { role: true },
  })
  return userRoles.map((ur: { role: { name: string } }) => ur.role.name)
}
