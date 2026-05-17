import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GroupMemberStatus } from '@prisma/client'
import { suspendEnterpriseGroupMemberships, removeEnterpriseGroupMemberships } from './group-membership-sync'

// ─── Mock DB ──────────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    groupMembership: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  }
}

describe('group-membership-sync', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb()
  })

  describe('suspendEnterpriseGroupMemberships', () => {
    it('should return zero counts when no active memberships exist', async () => {
      db.groupMembership.findMany.mockResolvedValue([])

      const result = await suspendEnterpriseGroupMemberships(
        db as any, 'enterprise-1', 'Vi phạm quy chế', 'admin-1'
      )

      expect(result.membershipsUpdated).toBe(0)
      expect(result.auditLogsCreated).toBe(0)
      expect(result.notificationsCreated).toBe(0)
      expect(result.affectedUserIds).toEqual([])
    })

    it('should suspend all active group memberships for the enterprise', async () => {
      const mockMemberships = [
        { id: 'gm-1', groupId: 'group-1', userId: 'user-1', enterpriseId: 'enterprise-1', status: GroupMemberStatus.ACTIVE },
        { id: 'gm-2', groupId: 'group-2', userId: 'user-2', enterpriseId: 'enterprise-1', status: GroupMemberStatus.ACTIVE },
      ]
      db.groupMembership.findMany.mockResolvedValue(mockMemberships)
      db.groupMembership.update.mockResolvedValue({})
      db.auditLog.create.mockResolvedValue({})
      db.notification.create.mockResolvedValue({})

      const result = await suspendEnterpriseGroupMemberships(
        db as any, 'enterprise-1', 'Tạm ngưng do vi phạm', 'admin-1'
      )

      expect(result.membershipsUpdated).toBe(2)
      expect(result.auditLogsCreated).toBe(2)
      expect(result.notificationsCreated).toBe(2)
      expect(result.affectedUserIds).toEqual(['user-1', 'user-2'])

      // Verify updates
      expect(db.groupMembership.update).toHaveBeenCalledTimes(2)
      expect(db.groupMembership.update).toHaveBeenCalledWith({
        where: { id: 'gm-1' },
        data: { status: GroupMemberStatus.SUSPENDED },
      })
      expect(db.groupMembership.update).toHaveBeenCalledWith({
        where: { id: 'gm-2' },
        data: { status: GroupMemberStatus.SUSPENDED },
      })
    })

    it('should create audit logs with correct action and data', async () => {
      const mockMemberships = [
        { id: 'gm-1', groupId: 'group-1', userId: 'user-1', enterpriseId: 'enterprise-1', status: GroupMemberStatus.ACTIVE },
      ]
      db.groupMembership.findMany.mockResolvedValue(mockMemberships)
      db.groupMembership.update.mockResolvedValue({})
      db.auditLog.create.mockResolvedValue({})
      db.notification.create.mockResolvedValue({})

      await suspendEnterpriseGroupMemberships(
        db as any, 'enterprise-1', 'Lý do test', 'admin-1'
      )

      expect(db.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'admin-1',
          action: 'GROUP_MEMBER_SUSPENDED_AUTO',
          targetType: 'GroupMembership',
          targetId: 'gm-1',
          beforeVal: { status: GroupMemberStatus.ACTIVE, enterpriseId: 'enterprise-1', groupId: 'group-1' },
          afterVal: { status: GroupMemberStatus.SUSPENDED, reason: 'Lý do test' },
        },
      })
    })

    it('should deduplicate user IDs when same user has multiple memberships', async () => {
      const mockMemberships = [
        { id: 'gm-1', groupId: 'group-1', userId: 'user-1', enterpriseId: 'enterprise-1', status: GroupMemberStatus.ACTIVE },
        { id: 'gm-2', groupId: 'group-2', userId: 'user-1', enterpriseId: 'enterprise-1', status: GroupMemberStatus.ACTIVE },
      ]
      db.groupMembership.findMany.mockResolvedValue(mockMemberships)
      db.groupMembership.update.mockResolvedValue({})
      db.auditLog.create.mockResolvedValue({})
      db.notification.create.mockResolvedValue({})

      const result = await suspendEnterpriseGroupMemberships(
        db as any, 'enterprise-1', undefined, 'admin-1'
      )

      expect(result.affectedUserIds).toEqual(['user-1'])
      expect(result.notificationsCreated).toBe(1)
      expect(db.notification.create).toHaveBeenCalledTimes(1)
    })

    it('should use default reason when none provided', async () => {
      const mockMemberships = [
        { id: 'gm-1', groupId: 'group-1', userId: 'user-1', enterpriseId: 'enterprise-1', status: GroupMemberStatus.ACTIVE },
      ]
      db.groupMembership.findMany.mockResolvedValue(mockMemberships)
      db.groupMembership.update.mockResolvedValue({})
      db.auditLog.create.mockResolvedValue({})
      db.notification.create.mockResolvedValue({})

      await suspendEnterpriseGroupMemberships(
        db as any, 'enterprise-1', undefined, 'admin-1'
      )

      expect(db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            afterVal: { status: GroupMemberStatus.SUSPENDED, reason: 'Enterprise membership suspended' },
          }),
        })
      )
    })
  })

  describe('removeEnterpriseGroupMemberships', () => {
    it('should return zero counts when no memberships exist', async () => {
      db.groupMembership.findMany.mockResolvedValue([])

      const result = await removeEnterpriseGroupMemberships(
        db as any, 'enterprise-1', 'Chấm dứt hợp đồng', 'admin-1'
      )

      expect(result.membershipsUpdated).toBe(0)
      expect(result.auditLogsCreated).toBe(0)
      expect(result.notificationsCreated).toBe(0)
      expect(result.affectedUserIds).toEqual([])
    })

    it('should remove both ACTIVE and SUSPENDED memberships', async () => {
      const mockMemberships = [
        { id: 'gm-1', groupId: 'group-1', userId: 'user-1', enterpriseId: 'enterprise-1', status: GroupMemberStatus.ACTIVE },
        { id: 'gm-2', groupId: 'group-2', userId: 'user-2', enterpriseId: 'enterprise-1', status: GroupMemberStatus.SUSPENDED },
      ]
      db.groupMembership.findMany.mockResolvedValue(mockMemberships)
      db.groupMembership.update.mockResolvedValue({})
      db.auditLog.create.mockResolvedValue({})
      db.notification.create.mockResolvedValue({})

      const result = await removeEnterpriseGroupMemberships(
        db as any, 'enterprise-1', 'Chấm dứt tư cách', 'admin-1'
      )

      expect(result.membershipsUpdated).toBe(2)
      expect(result.auditLogsCreated).toBe(2)
      expect(result.notificationsCreated).toBe(2)
      expect(result.affectedUserIds).toEqual(['user-1', 'user-2'])

      // Verify all updated to REMOVED
      expect(db.groupMembership.update).toHaveBeenCalledWith({
        where: { id: 'gm-1' },
        data: { status: GroupMemberStatus.REMOVED },
      })
      expect(db.groupMembership.update).toHaveBeenCalledWith({
        where: { id: 'gm-2' },
        data: { status: GroupMemberStatus.REMOVED },
      })
    })

    it('should create audit logs with REMOVED_AUTO action', async () => {
      const mockMemberships = [
        { id: 'gm-1', groupId: 'group-1', userId: 'user-1', enterpriseId: 'enterprise-1', status: GroupMemberStatus.SUSPENDED },
      ]
      db.groupMembership.findMany.mockResolvedValue(mockMemberships)
      db.groupMembership.update.mockResolvedValue({})
      db.auditLog.create.mockResolvedValue({})
      db.notification.create.mockResolvedValue({})

      await removeEnterpriseGroupMemberships(
        db as any, 'enterprise-1', 'Hết hạn hợp đồng', 'admin-1'
      )

      expect(db.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'admin-1',
          action: 'GROUP_MEMBER_REMOVED_AUTO',
          targetType: 'GroupMembership',
          targetId: 'gm-1',
          beforeVal: { status: GroupMemberStatus.SUSPENDED, enterpriseId: 'enterprise-1', groupId: 'group-1' },
          afterVal: { status: GroupMemberStatus.REMOVED, reason: 'Hết hạn hợp đồng' },
        },
      })
    })

    it('should create notifications with removal message', async () => {
      const mockMemberships = [
        { id: 'gm-1', groupId: 'group-1', userId: 'user-1', enterpriseId: 'enterprise-1', status: GroupMemberStatus.ACTIVE },
      ]
      db.groupMembership.findMany.mockResolvedValue(mockMemberships)
      db.groupMembership.update.mockResolvedValue({})
      db.auditLog.create.mockResolvedValue({})
      db.notification.create.mockResolvedValue({})

      await removeEnterpriseGroupMemberships(
        db as any, 'enterprise-1', 'Vi phạm nghiêm trọng', 'admin-1'
      )

      expect(db.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'GROUP_ACCESS_REMOVED',
          title: 'Quyền truy cập nhóm bị xóa',
          message: 'Bạn đã bị xóa khỏi các nhóm làm việc do doanh nghiệp bị chấm dứt tư cách hội viên. Lý do: Vi phạm nghiêm trọng',
          link: '/groups',
          read: false,
        },
      })
    })
  })
})
