import { type TRPCContext } from '../context'

/**
 * Paths that should be skipped by the audit middleware.
 * These contain sensitive data (passwords) or are not meaningful to audit.
 */
export const SKIP_PATHS = new Set([
  'auth.login',
  'auth.changePassword',
  'auth.resetPassword',
  'auth.verifyTwoFactor',
  'auth.setupTwoFactor',
])

/**
 * Fields to strip from input before storing in audit log.
 * Prevents sensitive data from being persisted.
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'secret',
  'totpCode',
])

/**
 * Sanitize input by removing sensitive fields.
 * Returns a shallow copy with sensitive keys replaced by '[REDACTED]'.
 */
export function sanitizeInput(input: unknown): unknown {
  if (input === null || input === undefined) return input
  if (typeof input !== 'object') return input
  if (Array.isArray(input)) return input.map(sanitizeInput)

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.has(key)) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeInput(value)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

/**
 * Core audit logging logic, extracted for use by the tRPC middleware.
 * Creates an AuditLog entry after a successful mutation.
 *
 * Features:
 * - Skips sensitive paths (auth.login, password changes)
 * - Sanitizes input (removes password fields)
 * - Only logs after successful mutations (not queries)
 * - Non-blocking: audit log creation errors don't fail the mutation
 */
export function createAuditEntry(opts: {
  ctx: TRPCContext
  path: string
  input: unknown
}): void {
  const { ctx, path, input } = opts

  if (!ctx.session?.user) return

  const userId = ctx.session.user.id
  const sanitizedInput = sanitizeInput(input)

  // Extract targetType from path (e.g., "documents.create" → "documents")
  const pathParts = path.split('.')
  const targetType = pathParts[0] ?? path

  // Try to extract ID from input
  let targetId = 'unknown'
  if (typeof input === 'object' && input !== null) {
    const inputObj = input as Record<string, unknown>
    if (typeof inputObj.id === 'string') {
      targetId = inputObj.id
    } else if (typeof inputObj.targetId === 'string') {
      targetId = inputObj.targetId
    }
  }

  // Non-blocking audit log creation
  ctx.db.auditLog
    .create({
      data: {
        userId,
        action: path,
        targetType,
        targetId,
        afterVal: sanitizedInput as object ?? undefined,
      },
    })
    .catch((err: unknown) => {
      console.error('[AuditMiddleware] Failed to create audit log:', err)
    })
}
