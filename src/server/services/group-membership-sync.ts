import { type PrismaClient, GroupMemberStatus } from '@prisma/client'

// Transaction client type — compatible with both PrismaClient and $transaction callback arg
type DbClient = {
  groupMembership: PrismaClient['groupMembership']
  auditLog: PrismaClient['auditLog']
  notification: PrismaClient['notification']
}

/**
 * Kết quả của việc đồng bộ group memberships khi enterprise bị suspend/terminate.
 */
export interface GroupMembershipSyncResult {
  /** Số group memberships đã bị cập nhật */
  membershipsUpdated: number
  /** Số audit logs đã tạo */
  auditLogsCreated: number
  /** Số notifications đã tạo */
  notificationsCreated: number
  /** Danh sách user IDs bị ảnh hưởng */
  affectedUserIds: string[]
}

/**
 * Suspend tất cả group memberships đang ACTIVE của một enterprise.
 * Gọi khi enterprise membershipStatus chuyển sang SUSPENDED.
 *
 * @param db - Prisma client (hoặc transaction client)
 * @param enterpriseId - ID của enterprise bị suspend
 * @param reason - Lý do suspend
 * @param performedBy - User ID thực hiện thao tác
 */
export async function suspendEnterpriseGroupMemberships(
  db: DbClient,
  enterpriseId: string,
  reason: string | undefined,
  performedBy: string,
): Promise<GroupMembershipSyncResult> {
  // Tìm tất cả group memberships ACTIVE liên kết với enterprise này
  const activeMemberships = await db.groupMembership.findMany({
    where: {
      enterpriseId,
      status: GroupMemberStatus.ACTIVE,
    },
  })

  if (activeMemberships.length === 0) {
    return { membershipsUpdated: 0, auditLogsCreated: 0, notificationsCreated: 0, affectedUserIds: [] }
  }

  const affectedUserIds: string[] = []

  // Cập nhật từng membership sang SUSPENDED
  for (const membership of activeMemberships) {
    await db.groupMembership.update({
      where: { id: membership.id },
      data: { status: GroupMemberStatus.SUSPENDED },
    })

    // Tạo audit log
    await db.auditLog.create({
      data: {
        userId: performedBy,
        action: 'GROUP_MEMBER_SUSPENDED_AUTO',
        targetType: 'GroupMembership',
        targetId: membership.id,
        beforeVal: { status: membership.status, enterpriseId, groupId: membership.groupId },
        afterVal: { status: GroupMemberStatus.SUSPENDED, reason: reason ?? 'Enterprise membership suspended' },
      },
    })

    if (!affectedUserIds.includes(membership.userId)) {
      affectedUserIds.push(membership.userId)
    }
  }

  // Tạo notifications cho các user bị ảnh hưởng
  let notificationsCreated = 0
  for (const userId of affectedUserIds) {
    await db.notification.create({
      data: {
        userId,
        type: 'GROUP_ACCESS_SUSPENDED',
        title: 'Quyền truy cập nhóm bị tạm ngưng',
        message: reason
          ? `Quyền truy cập nhóm làm việc của bạn đã bị tạm ngưng do doanh nghiệp bị tạm ngưng tư cách hội viên. Lý do: ${reason}`
          : 'Quyền truy cập nhóm làm việc của bạn đã bị tạm ngưng do doanh nghiệp bị tạm ngưng tư cách hội viên.',
        link: '/groups',
        read: false,
      },
    })
    notificationsCreated++
  }

  return {
    membershipsUpdated: activeMemberships.length,
    auditLogsCreated: activeMemberships.length,
    notificationsCreated,
    affectedUserIds,
  }
}

/**
 * Remove tất cả group memberships (ACTIVE hoặc SUSPENDED) của một enterprise.
 * Gọi khi enterprise membershipStatus chuyển sang TERMINATED.
 *
 * @param db - Prisma client (hoặc transaction client)
 * @param enterpriseId - ID của enterprise bị terminate
 * @param reason - Lý do terminate
 * @param performedBy - User ID thực hiện thao tác
 */
export async function removeEnterpriseGroupMemberships(
  db: DbClient,
  enterpriseId: string,
  reason: string | undefined,
  performedBy: string,
): Promise<GroupMembershipSyncResult> {
  // Tìm tất cả group memberships ACTIVE hoặc SUSPENDED liên kết với enterprise này
  const memberships = await db.groupMembership.findMany({
    where: {
      enterpriseId,
      status: { in: [GroupMemberStatus.ACTIVE, GroupMemberStatus.SUSPENDED] },
    },
  })

  if (memberships.length === 0) {
    return { membershipsUpdated: 0, auditLogsCreated: 0, notificationsCreated: 0, affectedUserIds: [] }
  }

  const affectedUserIds: string[] = []

  // Cập nhật từng membership sang REMOVED
  for (const membership of memberships) {
    await db.groupMembership.update({
      where: { id: membership.id },
      data: { status: GroupMemberStatus.REMOVED },
    })

    // Tạo audit log
    await db.auditLog.create({
      data: {
        userId: performedBy,
        action: 'GROUP_MEMBER_REMOVED_AUTO',
        targetType: 'GroupMembership',
        targetId: membership.id,
        beforeVal: { status: membership.status, enterpriseId, groupId: membership.groupId },
        afterVal: { status: GroupMemberStatus.REMOVED, reason: reason ?? 'Enterprise membership terminated' },
      },
    })

    if (!affectedUserIds.includes(membership.userId)) {
      affectedUserIds.push(membership.userId)
    }
  }

  // Tạo notifications cho các user bị ảnh hưởng
  let notificationsCreated = 0
  for (const userId of affectedUserIds) {
    await db.notification.create({
      data: {
        userId,
        type: 'GROUP_ACCESS_REMOVED',
        title: 'Quyền truy cập nhóm bị xóa',
        message: reason
          ? `Bạn đã bị xóa khỏi các nhóm làm việc do doanh nghiệp bị chấm dứt tư cách hội viên. Lý do: ${reason}`
          : 'Bạn đã bị xóa khỏi các nhóm làm việc do doanh nghiệp bị chấm dứt tư cách hội viên.',
        link: '/groups',
        read: false,
      },
    })
    notificationsCreated++
  }

  return {
    membershipsUpdated: memberships.length,
    auditLogsCreated: memberships.length,
    notificationsCreated,
    affectedUserIds,
  }
}
