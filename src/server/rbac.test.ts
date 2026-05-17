import { describe, it, expect } from "vitest"
import {
  checkRole,
  checkScope,
  getEffectiveRoles,
  ROLE_HIERARCHY,
  type UserRoleWithScope,
} from "./rbac"

describe("RBAC utilities", () => {
  describe("ROLE_HIERARCHY", () => {
    it("System_Admin inherits all roles", () => {
      expect(ROLE_HIERARCHY.System_Admin).toContain("Director")
      expect(ROLE_HIERARCHY.System_Admin).toContain("Viewer")
      expect(ROLE_HIERARCHY.System_Admin).toContain("Project_Manager")
    })

    it("Director inherits operational roles", () => {
      expect(ROLE_HIERARCHY.Director).toContain("Core_Team_Member")
      expect(ROLE_HIERARCHY.Director).toContain("Legal_Officer")
      expect(ROLE_HIERARCHY.Director).toContain("Viewer")
    })
  })

  describe("getEffectiveRoles", () => {
    it("returns the role itself when no hierarchy", () => {
      const result = getEffectiveRoles(["Viewer"])
      expect(result).toContain("Viewer")
    })

    it("includes inherited roles for Director", () => {
      const result = getEffectiveRoles(["Director"])
      expect(result).toContain("Director")
      expect(result).toContain("Core_Team_Member")
      expect(result).toContain("Viewer")
    })

    it("includes inherited roles for System_Admin", () => {
      const result = getEffectiveRoles(["System_Admin"])
      expect(result).toContain("System_Admin")
      expect(result).toContain("Director")
      expect(result).toContain("Viewer")
      expect(result).toContain("Enterprise_Member")
    })

    it("merges multiple roles", () => {
      const result = getEffectiveRoles(["Legal_Officer", "Project_Manager"])
      expect(result).toContain("Legal_Officer")
      expect(result).toContain("Project_Manager")
      expect(result).toContain("Viewer") // from Project_Manager hierarchy
    })
  })

  describe("checkRole", () => {
    it("System_Admin always passes", () => {
      expect(checkRole(["System_Admin"], ["Legal_Officer"])).toBe(true)
      expect(checkRole(["System_Admin"], ["Director"])).toBe(true)
      expect(checkRole(["System_Admin"], ["Enterprise_Member"])).toBe(true)
    })

    it("returns true when user has exact required role", () => {
      expect(checkRole(["Legal_Officer"], ["Legal_Officer"])).toBe(true)
    })

    it("returns true when user has one of multiple required roles (OR)", () => {
      expect(checkRole(["Legal_Officer"], ["DPO", "Legal_Officer"])).toBe(true)
    })

    it("returns false when user lacks required role", () => {
      expect(checkRole(["Viewer"], ["Director"])).toBe(false)
    })

    it("returns true via hierarchy (Director has Legal_Officer)", () => {
      expect(checkRole(["Director"], ["Legal_Officer"])).toBe(true)
    })

    it("returns true via hierarchy (Tech_Director has Project_Manager)", () => {
      expect(checkRole(["Tech_Director"], ["Project_Manager"])).toBe(true)
    })

    it("returns false when hierarchy does not include required role", () => {
      expect(checkRole(["Project_Manager"], ["Director"])).toBe(false)
    })
  })

  describe("checkScope", () => {
    it("System_Admin bypasses scope checks", () => {
      const roles: UserRoleWithScope[] = [
        { roleName: "System_Admin", scope: null },
      ]
      expect(checkScope(roles, "Project_Manager", "project", "abc123")).toBe(true)
    })

    it("org scope grants access to any scope", () => {
      const roles: UserRoleWithScope[] = [
        { roleName: "Project_Manager", scope: "org" },
      ]
      expect(checkScope(roles, "Project_Manager", "project", "abc123")).toBe(true)
      expect(checkScope(roles, "Project_Manager", "project", "xyz789")).toBe(true)
    })

    it("exact scope match grants access", () => {
      const roles: UserRoleWithScope[] = [
        { roleName: "Project_Manager", scope: "project:abc123" },
      ]
      expect(checkScope(roles, "Project_Manager", "project", "abc123")).toBe(true)
    })

    it("different scope denies access", () => {
      const roles: UserRoleWithScope[] = [
        { roleName: "Project_Manager", scope: "project:abc123" },
      ]
      expect(checkScope(roles, "Project_Manager", "project", "xyz789")).toBe(false)
    })

    it("wrong role denies access even with matching scope", () => {
      const roles: UserRoleWithScope[] = [
        { roleName: "Viewer", scope: "project:abc123" },
      ]
      expect(checkScope(roles, "Project_Manager", "project", "abc123")).toBe(false)
    })

    it("group scope works correctly", () => {
      const roles: UserRoleWithScope[] = [
        { roleName: "Group_Moderator", scope: "group:grp1" },
      ]
      expect(checkScope(roles, "Group_Moderator", "group", "grp1")).toBe(true)
      expect(checkScope(roles, "Group_Moderator", "group", "grp2")).toBe(false)
    })

    it("hierarchy applies in scope check (Director has Project_Manager)", () => {
      const roles: UserRoleWithScope[] = [
        { roleName: "Director", scope: "org" },
      ]
      expect(checkScope(roles, "Project_Manager", "project", "abc123")).toBe(true)
    })
  })
})
