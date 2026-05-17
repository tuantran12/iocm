/**
 * RBAC utility functions for IOCM.
 * Provides role checking, scope validation, and role hierarchy.
 */

/**
 * Role hierarchy — higher roles inherit permissions of lower roles.
 * System_Admin bypasses all checks.
 * Director inherits most operational roles.
 */
export const ROLE_HIERARCHY: Record<string, string[]> = {
  System_Admin: [
    "Director",
    "Core_Team_Member",
    "Legal_Officer",
    "Finance_Officer",
    "Membership_Manager",
    "Partnership_Manager",
    "DPO",
    "Tech_Director",
    "Project_Manager",
    "Community_Officer",
    "Council_Chair",
    "Council_Member",
    "Enterprise_Admin",
    "Enterprise_Member",
    "Group_Moderator",
    "External_Expert",
    "Auditor",
    "Viewer",
  ],
  Director: [
    "Core_Team_Member",
    "Legal_Officer",
    "Finance_Officer",
    "Membership_Manager",
    "Partnership_Manager",
    "DPO",
    "Tech_Director",
    "Project_Manager",
    "Community_Officer",
    "Council_Chair",
    "Viewer",
  ],
  Council_Chair: ["Council_Member", "Viewer"],
  Tech_Director: ["Project_Manager", "Viewer"],
  Membership_Manager: ["Community_Officer", "Viewer"],
  Partnership_Manager: ["Viewer"],
  Project_Manager: ["Viewer"],
}

/**
 * Get all effective roles for a user, including inherited roles from hierarchy.
 */
export function getEffectiveRoles(userRoles: string[]): string[] {
  const effective = new Set<string>(userRoles)

  for (const role of userRoles) {
    const inherited = ROLE_HIERARCHY[role]
    if (inherited) {
      for (const r of inherited) {
        effective.add(r)
      }
    }
  }

  return Array.from(effective)
}

/**
 * Check if user has at least one of the required roles (OR logic).
 * System_Admin always passes.
 */
export function checkRole(userRoles: string[], requiredRoles: string[]): boolean {
  if (userRoles.includes("System_Admin")) return true

  const effective = getEffectiveRoles(userRoles)
  return requiredRoles.some((role) => effective.includes(role))
}

/**
 * UserRole record with role name and scope for scope-based checks.
 */
export interface UserRoleWithScope {
  roleName: string
  scope: string | null
}

/**
 * Check if user has the required role with matching scope.
 * Scope format: "org" (organization-wide), "group:{id}", "project:{id}"
 * System_Admin always passes.
 * "org" scope grants access to all scopes of that role.
 */
export function checkScope(
  userRolesWithScope: UserRoleWithScope[],
  requiredRole: string,
  scopeType: string,
  scopeId: string
): boolean {
  // System_Admin bypasses all scope checks
  if (userRolesWithScope.some((ur) => ur.roleName === "System_Admin")) return true

  const targetScope = `${scopeType}:${scopeId}`

  for (const ur of userRolesWithScope) {
    // Check direct role match
    const effectiveRoles = getEffectiveRoles([ur.roleName])
    if (!effectiveRoles.includes(requiredRole) && ur.roleName !== requiredRole) continue

    // "org" scope grants access everywhere for that role
    if (ur.scope === "org") return true

    // Exact scope match
    if (ur.scope === targetScope) return true
  }

  return false
}
