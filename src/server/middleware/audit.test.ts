import { describe, it, expect, vi } from 'vitest'
import { sanitizeInput, SKIP_PATHS, createAuditEntry } from './audit'

describe('Audit Middleware', () => {
  describe('sanitizeInput', () => {
    it('returns null/undefined as-is', () => {
      expect(sanitizeInput(null)).toBeNull()
      expect(sanitizeInput(undefined)).toBeUndefined()
    })

    it('returns primitives as-is', () => {
      expect(sanitizeInput('hello')).toBe('hello')
      expect(sanitizeInput(42)).toBe(42)
      expect(sanitizeInput(true)).toBe(true)
    })

    it('redacts password fields', () => {
      const input = { email: 'test@example.com', password: 'secret123' }
      const result = sanitizeInput(input) as Record<string, unknown>
      expect(result.email).toBe('test@example.com')
      expect(result.password).toBe('[REDACTED]')
    })

    it('redacts nested sensitive fields', () => {
      const input = {
        user: { name: 'Test', newPassword: 'abc123', confirmPassword: 'abc123' },
        data: 'safe',
      }
      const result = sanitizeInput(input) as Record<string, unknown>
      const user = result.user as Record<string, unknown>
      expect(user.name).toBe('Test')
      expect(user.newPassword).toBe('[REDACTED]')
      expect(user.confirmPassword).toBe('[REDACTED]')
      expect(result.data).toBe('safe')
    })

    it('redacts token and secret fields', () => {
      const input = { token: 'jwt-token', secret: 'totp-secret', id: '123' }
      const result = sanitizeInput(input) as Record<string, unknown>
      expect(result.token).toBe('[REDACTED]')
      expect(result.secret).toBe('[REDACTED]')
      expect(result.id).toBe('123')
    })

    it('handles arrays', () => {
      const input = [
        { name: 'a', password: 'x' },
        { name: 'b', password: 'y' },
      ]
      const result = sanitizeInput(input) as Array<Record<string, unknown>>
      expect(result[0]!.name).toBe('a')
      expect(result[0]!.password).toBe('[REDACTED]')
      expect(result[1]!.name).toBe('b')
      expect(result[1]!.password).toBe('[REDACTED]')
    })

    it('preserves non-sensitive object fields', () => {
      const input = { id: 'abc', name: 'Test Doc', status: 'ACTIVE' }
      const result = sanitizeInput(input)
      expect(result).toEqual(input)
    })
  })

  describe('SKIP_PATHS', () => {
    it('includes auth.login', () => {
      expect(SKIP_PATHS.has('auth.login')).toBe(true)
    })

    it('includes auth.changePassword', () => {
      expect(SKIP_PATHS.has('auth.changePassword')).toBe(true)
    })

    it('does not include documents.create', () => {
      expect(SKIP_PATHS.has('documents.create')).toBe(false)
    })
  })

  describe('createAuditEntry', () => {
    it('creates audit log with correct data for a mutation', async () => {
      const mockCreate = vi.fn().mockResolvedValue({})
      const ctx = {
        session: {
          user: { id: 'user-1', email: 'test@test.com', name: 'Test' },
          roles: ['Core_Team_Member'],
        },
        db: { auditLog: { create: mockCreate } },
        headers: undefined,
      }

      createAuditEntry({
        ctx: ctx as any,
        path: 'documents.create',
        input: { name: 'Test Doc', cluster: 'CORE_FOUNDING' },
      })

      // Wait for the async create to be called
      await new Promise((r) => setTimeout(r, 10))

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: 'documents.create',
          targetType: 'documents',
          targetId: 'unknown',
          afterVal: { name: 'Test Doc', cluster: 'CORE_FOUNDING' },
        },
      })
    })

    it('extracts targetId from input.id', async () => {
      const mockCreate = vi.fn().mockResolvedValue({})
      const ctx = {
        session: {
          user: { id: 'user-1', email: 'test@test.com', name: 'Test' },
          roles: [],
        },
        db: { auditLog: { create: mockCreate } },
        headers: undefined,
      }

      createAuditEntry({
        ctx: ctx as any,
        path: 'members.update',
        input: { id: 'member-123', name: 'Updated Name' },
      })

      await new Promise((r) => setTimeout(r, 10))

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          targetType: 'members',
          targetId: 'member-123',
        }),
      })
    })

    it('sanitizes sensitive fields in input', async () => {
      const mockCreate = vi.fn().mockResolvedValue({})
      const ctx = {
        session: {
          user: { id: 'user-1', email: 'test@test.com', name: 'Test' },
          roles: [],
        },
        db: { auditLog: { create: mockCreate } },
        headers: undefined,
      }

      createAuditEntry({
        ctx: ctx as any,
        path: 'users.create',
        input: { email: 'new@test.com', password: 'secret123', name: 'New User' },
      })

      await new Promise((r) => setTimeout(r, 10))

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          afterVal: { email: 'new@test.com', password: '[REDACTED]', name: 'New User' },
        }),
      })
    })

    it('does not create audit log when no session', async () => {
      const mockCreate = vi.fn().mockResolvedValue({})
      const ctx = {
        session: null,
        db: { auditLog: { create: mockCreate } },
        headers: undefined,
      }

      createAuditEntry({
        ctx: ctx as any,
        path: 'documents.create',
        input: { name: 'Test' },
      })

      await new Promise((r) => setTimeout(r, 10))

      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('does not throw when audit log creation fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const mockCreate = vi.fn().mockRejectedValue(new Error('DB connection failed'))
      const ctx = {
        session: {
          user: { id: 'user-1', email: 'test@test.com', name: 'Test' },
          roles: [],
        },
        db: { auditLog: { create: mockCreate } },
        headers: undefined,
      }

      // Should not throw
      createAuditEntry({
        ctx: ctx as any,
        path: 'documents.create',
        input: { name: 'Test' },
      })

      await new Promise((r) => setTimeout(r, 10))

      expect(consoleError).toHaveBeenCalledWith(
        '[AuditMiddleware] Failed to create audit log:',
        expect.any(Error)
      )
      consoleError.mockRestore()
    })
  })
})
