import type { PrismaClient, ConsentRecord } from '@prisma/client'

/**
 * Consent Withdrawal Service — Cascading alerts when consent is withdrawn.
 *
 * When a data subject withdraws consent:
 * 1. Identify affected entities (projects, datasets)
 * 2. Create notifications for DPO role users
 * 3. Notify project owner if consent is linked to a project
 * 4. Log the cascade in audit log
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AffectedEntity {
  type: 'project' | 'dataset'
  id: string
  name?: string
}

export interface WithdrawalAlert {
  userId: string
  type: string
  title: string
  message: string
  link: string
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Identifies projects and datasets affected by a consent withdrawal.
 */
export function getAffectedEntities(consentRecord: ConsentRecord): AffectedEntity[] {
  const entities: AffectedEntity[] = []

  if (consentRecord.projectId) {
    entities.push({
      type: 'project',
      id: consentRecord.projectId,
    })
  }

  if (consentRecord.datasetId) {
    entities.push({
      type: 'dataset',
      id: consentRecord.datasetId,
    })
  }

  return entities
}


/**
 * Builds withdrawal alert objects for DPO users and project owner.
 * Returns alert objects ready to be persisted as Notification records.
 */
export function buildWithdrawalAlerts(
  consentRecord: ConsentRecord,
  subjectLabel: string,
  dpoUserIds: string[],
  projectOwnerId?: string | null,
): WithdrawalAlert[] {
  const alerts: WithdrawalAlert[] = []
  const consentLink = `/data/consent?id=${consentRecord.id}`

  const title = 'Rút lại đồng ý thu thập dữ liệu'
  const message = `Đồng ý thu thập dữ liệu đã bị rút lại bởi ${subjectLabel}. Mục đích: ${consentRecord.purpose}.`

  // Notify all DPO users
  for (const dpoUserId of dpoUserIds) {
    alerts.push({
      userId: dpoUserId,
      type: 'CONSENT_WITHDRAWN',
      title,
      message,
      link: consentLink,
    })
  }

  // Notify project owner if consent is linked to a project
  if (projectOwnerId && consentRecord.projectId) {
    const projectMessage = `Đồng ý thu thập dữ liệu liên quan đến dự án đã bị rút lại bởi ${subjectLabel}. Mục đích: ${consentRecord.purpose}. Vui lòng kiểm tra dữ liệu bị ảnh hưởng.`
    alerts.push({
      userId: projectOwnerId,
      type: 'CONSENT_WITHDRAWN',
      title: 'Rút lại đồng ý — Dự án bị ảnh hưởng',
      message: projectMessage,
      link: consentLink,
    })
  }

  return alerts
}

/**
 * Executes the full consent withdrawal cascade:
 * 1. Finds DPO users
 * 2. Finds project owner (if applicable)
 * 3. Creates Notification records
 * 4. Logs the cascade in audit log
 *
 * Should be called within a transaction after the consent status is updated.
 */
export async function createWithdrawalAlerts(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  consentRecord: ConsentRecord,
  userId: string,
): Promise<WithdrawalAlert[]> {
  // 1. Find DPO role users
  const dpoRole = await tx.role.findUnique({ where: { name: 'DPO' } })
  const dpoUserIds: string[] = []

  if (dpoRole) {
    const dpoUserRoles = await tx.userRole.findMany({
      where: { roleId: dpoRole.id },
      select: { userId: true },
    })
    dpoUserIds.push(...dpoUserRoles.map((ur) => ur.userId))
  }

  // 2. Find project owner if consent is linked to a project
  let projectOwnerId: string | null = null
  if (consentRecord.projectId) {
    const project = await tx.project.findUnique({
      where: { id: consentRecord.projectId },
      select: { ownerId: true },
    })
    projectOwnerId = project?.ownerId ?? null
  }

  // 3. Build alerts
  const subjectLabel = consentRecord.subjectId
  const alerts = buildWithdrawalAlerts(consentRecord, subjectLabel, dpoUserIds, projectOwnerId)

  // 4. Persist notifications
  if (alerts.length > 0) {
    await tx.notification.createMany({
      data: alerts.map((alert) => ({
        userId: alert.userId,
        type: alert.type,
        title: alert.title,
        message: alert.message,
        link: alert.link,
      })),
    })
  }

  // 5. Log the cascade in audit log
  const affectedEntities = getAffectedEntities(consentRecord)
  await tx.auditLog.create({
    data: {
      userId,
      action: 'CONSENT_WITHDRAWAL_CASCADE',
      targetType: 'ConsentRecord',
      targetId: consentRecord.id,
      afterVal: JSON.parse(JSON.stringify({
        alertsSent: alerts.length,
        dpoNotified: dpoUserIds.length,
        projectOwnerNotified: !!projectOwnerId,
        affectedEntities,
      })),
    },
  })

  return alerts
}
