import { describe, it, expect, vi, beforeEach } from 'vitest'
import { router } from '../../trpc'
import { authRouter } from '../auth'
import { usersRouter } from '../users'
import { TRPCError } from '@trpc/server'

/**
 * Mock bcryptjs — control password comparison results
 */
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
  },
}))

vi.mock('@/lib/totp', () => ({
  generateTOTPSecret: vi.fn().mockReturnValue({ secret: 'TESTSECRET', uri: 'otpauth://...' }),
  verifyTOTP: vi.fn().mockReturnValue(true),
}))

import bcrypt from 'bcryptjs'

// --- Helpers ----------------------------------------------------------------

function createMockDb() {
  return {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    userRole: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  }
}

type MockDb = ReturnType<typeof createMockDb>

function createPublicContext(db: MockDb) {
  return { db, session: null, headers: undefined }
}

function createAuthenticatedContext(
  db: MockDb,
  userId: string,
  roles: string[] = []
) {
  return {
    db,
    session: {
      user: { id: userId, email: 'user@test.com', name: 'Test User' },
      roles,
    },
    headers: undefined,
  }
}


// --- Auth Router Tests -------------------------------------------------------

describe('authRouter', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  function createCaller(ctx: ReturnType<typeof createPublicContext>) {
    const appRouter = router({ auth: authRouter })
    return appRouter.createCaller(ctx as any)
  }

  // --- Test 1: Login success -------------------------------------------------

  describe('login', () => {
    it('should return user info on valid credentials', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'admin@iocm.vn',
        name: 'Admin User',
        passwordHash: '$2b$12$existinghash',
        status: 'ACTIVE',
        failedLogins: 0,
        lockedUntil: null,
        twoFactor: false,
        twoFactorSecret: null,
        roles: [
          { id: 'ur-1', role: { id: 'r-1', name: 'System_Admin' }, scope: 'org' },
        ],
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)
      ;(bcrypt.compare as any).mockResolvedValue(true)
      mockDb.user.update.mockResolvedValue(mockUser)

      const caller = createCaller(createPublicContext(mockDb))
      const result = await caller.auth.login({
        email: 'admin@iocm.vn',
        password: 'ValidPass1',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.requiresTwoFactor).toBe(false)
        expect(result.user.id).toBe('user-1')
        expect(result.user.email).toBe('admin@iocm.vn')
        expect(result.user.roles).toContain('System_Admin')
      }

      // Should reset failed logins
      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedLogins: 0, lockedUntil: null },
      })
    })

    it('should require 2FA when user has twoFactor enabled', async () => {
      const mockUser = {
        id: 'user-2fa',
        email: '2fa@iocm.vn',
        name: '2FA User',
        passwordHash: '$2b$12$existinghash',
        status: 'ACTIVE',
        failedLogins: 0,
        lockedUntil: null,
        twoFactor: true,
        twoFactorSecret: 'SOMESECRET',
        roles: [
          { id: 'ur-1', role: { id: 'r-1', name: 'Viewer' }, scope: 'org' },
        ],
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)
      ;(bcrypt.compare as any).mockResolvedValue(true)
      mockDb.user.update.mockResolvedValue(mockUser)

      const caller = createCaller(createPublicContext(mockDb))
      const result = await caller.auth.login({
        email: '2fa@iocm.vn',
        password: 'ValidPass1',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.requiresTwoFactor).toBe(true)
        expect(result.user.email).toBe('2fa@iocm.vn')
      }
    })

    // --- Test 2: Login fail — invalid password --------------------------------

    it('should return error on invalid password', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'admin@iocm.vn',
        name: 'Admin User',
        passwordHash: '$2b$12$existinghash',
        status: 'ACTIVE',
        failedLogins: 0,
        lockedUntil: null,
        twoFactor: false,
        twoFactorSecret: null,
        roles: [],
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)
      ;(bcrypt.compare as any).mockResolvedValue(false)
      mockDb.user.update.mockResolvedValue(mockUser)

      const caller = createCaller(createPublicContext(mockDb))
      const result = await caller.auth.login({
        email: 'admin@iocm.vn',
        password: 'WrongPassword1',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('không đúng')
      }

      // Should increment failed logins
      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedLogins: 1 },
      })
    })

    it('should return error when user does not exist', async () => {
      mockDb.user.findUnique.mockResolvedValue(null)

      const caller = createCaller(createPublicContext(mockDb))
      const result = await caller.auth.login({
        email: 'nonexistent@iocm.vn',
        password: 'SomePass1',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('không đúng')
      }
    })

    it('should return error when account is deactivated', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'deactivated@iocm.vn',
        name: 'Deactivated User',
        passwordHash: '$2b$12$hash',
        status: 'DEACTIVATED',
        failedLogins: 0,
        lockedUntil: null,
        twoFactor: false,
        twoFactorSecret: null,
        roles: [],
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)

      const caller = createCaller(createPublicContext(mockDb))
      const result = await caller.auth.login({
        email: 'deactivated@iocm.vn',
        password: 'ValidPass1',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('vô hiệu hóa')
      }
    })

    // --- Test 3: Account lockout — 5 failed attempts --------------------------

    it('should lock account after 5 failed attempts', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'admin@iocm.vn',
        name: 'Admin User',
        passwordHash: '$2b$12$existinghash',
        status: 'ACTIVE',
        failedLogins: 4, // Already 4 failed, this will be the 5th
        lockedUntil: null,
        twoFactor: false,
        twoFactorSecret: null,
        roles: [],
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)
      ;(bcrypt.compare as any).mockResolvedValue(false)
      mockDb.user.update.mockResolvedValue(mockUser)

      const caller = createCaller(createPublicContext(mockDb))
      const result = await caller.auth.login({
        email: 'admin@iocm.vn',
        password: 'WrongPassword1',
      })

      expect(result.success).toBe(false)

      // Should set lockedUntil (30 min from now)
      const updateCall = mockDb.user.update.mock.calls[0]![0] as any
      expect(updateCall.data.failedLogins).toBe(5)
      expect(updateCall.data.lockedUntil).toBeInstanceOf(Date)

      // Verify lock duration is approximately 30 minutes
      const lockTime = updateCall.data.lockedUntil as Date
      const thirtyMinFromNow = Date.now() + 30 * 60 * 1000
      expect(lockTime.getTime()).toBeGreaterThan(thirtyMinFromNow - 5000)
      expect(lockTime.getTime()).toBeLessThan(thirtyMinFromNow + 5000)
    })

    it('should reject login when account is locked', async () => {
      const futureDate = new Date(Date.now() + 15 * 60 * 1000) // 15 min from now
      const mockUser = {
        id: 'user-1',
        email: 'locked@iocm.vn',
        name: 'Locked User',
        passwordHash: '$2b$12$hash',
        status: 'ACTIVE',
        failedLogins: 5,
        lockedUntil: futureDate,
        twoFactor: false,
        twoFactorSecret: null,
        roles: [],
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)

      const caller = createCaller(createPublicContext(mockDb))
      const result = await caller.auth.login({
        email: 'locked@iocm.vn',
        password: 'ValidPass1',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('khóa tạm thời')
      }

      // Should NOT check password when locked
      expect(bcrypt.compare).not.toHaveBeenCalled()
    })

    it('should allow login after lock period expires', async () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000) // 5 min ago (expired)
      const mockUser = {
        id: 'user-1',
        email: 'unlocked@iocm.vn',
        name: 'Unlocked User',
        passwordHash: '$2b$12$hash',
        status: 'ACTIVE',
        failedLogins: 5,
        lockedUntil: pastDate,
        twoFactor: false,
        twoFactorSecret: null,
        roles: [{ id: 'ur-1', role: { id: 'r-1', name: 'Viewer' }, scope: 'org' }],
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)
      ;(bcrypt.compare as any).mockResolvedValue(true)
      mockDb.user.update.mockResolvedValue(mockUser)

      const caller = createCaller(createPublicContext(mockDb))
      const result = await caller.auth.login({
        email: 'unlocked@iocm.vn',
        password: 'ValidPass1',
      })

      expect(result.success).toBe(true)
      // Should reset failed logins
      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedLogins: 0, lockedUntil: null },
      })
    })
  })


  // --- verifyLoginTOTP -------------------------------------------------------

  describe('verifyLoginTOTP', () => {
    it('should verify valid TOTP token during login', async () => {
      const mockUser = {
        id: 'user-2fa',
        email: '2fa@iocm.vn',
        twoFactor: true,
        twoFactorSecret: 'SOMESECRET',
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)

      const caller = createCaller(createPublicContext(mockDb))
      const result = await caller.auth.verifyLoginTOTP({
        email: '2fa@iocm.vn',
        token: '123456',
      })

      expect(result.success).toBe(true)
    })

    it('should reject invalid TOTP token', async () => {
      const { verifyTOTP } = await import('@/lib/totp')
      ;(verifyTOTP as any).mockReturnValueOnce(false)

      const mockUser = {
        id: 'user-2fa',
        email: '2fa@iocm.vn',
        twoFactor: true,
        twoFactorSecret: 'SOMESECRET',
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)

      const caller = createCaller(createPublicContext(mockDb))
      const result = await caller.auth.verifyLoginTOTP({
        email: '2fa@iocm.vn',
        token: '000000',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('không đúng')
      }
    })

    it('should reject when user has no 2FA enabled', async () => {
      const mockUser = {
        id: 'user-no2fa',
        email: 'no2fa@iocm.vn',
        twoFactor: false,
        twoFactorSecret: null,
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)

      const caller = createCaller(createPublicContext(mockDb))
      const result = await caller.auth.verifyLoginTOTP({
        email: 'no2fa@iocm.vn',
        token: '123456',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('không hợp lệ')
      }
    })
  })

  // --- Password validation ---------------------------------------------------

  describe('changePassword', () => {
    it('should reject weak passwords (too short)', async () => {
      const caller = createCaller(
        createAuthenticatedContext(mockDb, 'user-1', ['Viewer']) as any
      )

      await expect(
        caller.auth.changePassword({
          oldPassword: 'OldPass1',
          newPassword: 'Ab1', // Too short
        })
      ).rejects.toThrow()
    })

    it('should reject passwords without uppercase', async () => {
      const caller = createCaller(
        createAuthenticatedContext(mockDb, 'user-1', ['Viewer']) as any
      )

      await expect(
        caller.auth.changePassword({
          oldPassword: 'OldPass1',
          newPassword: 'alllowercase1', // No uppercase
        })
      ).rejects.toThrow()
    })

    it('should reject passwords without number', async () => {
      const caller = createCaller(
        createAuthenticatedContext(mockDb, 'user-1', ['Viewer']) as any
      )

      await expect(
        caller.auth.changePassword({
          oldPassword: 'OldPass1',
          newPassword: 'NoNumberHere', // No digit
        })
      ).rejects.toThrow()
    })

    it('should accept valid password change', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@iocm.vn',
        name: 'User',
        passwordHash: '$2b$12$oldhash',
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)
      ;(bcrypt.compare as any)
        .mockResolvedValueOnce(true) // old password matches
        .mockResolvedValueOnce(false) // new password is different from old
      mockDb.user.update.mockResolvedValue(mockUser)

      const caller = createCaller(
        createAuthenticatedContext(mockDb, 'user-1', ['Viewer']) as any
      )
      const result = await caller.auth.changePassword({
        oldPassword: 'OldPass1',
        newPassword: 'NewValidPass1',
      })

      expect(result.success).toBe(true)
      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: '$2b$12$hashedpassword' },
      })
    })

    it('should reject when old password is wrong', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@iocm.vn',
        name: 'User',
        passwordHash: '$2b$12$oldhash',
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)
      ;(bcrypt.compare as any).mockResolvedValue(false) // old password doesn't match

      const caller = createCaller(
        createAuthenticatedContext(mockDb, 'user-1', ['Viewer']) as any
      )
      const result = await caller.auth.changePassword({
        oldPassword: 'WrongOldPass1',
        newPassword: 'NewValidPass1',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('không đúng')
      }
    })
  })

  // --- 2FA Setup & Verify ----------------------------------------------------

  describe('setup2FA', () => {
    it('should generate TOTP secret and URI', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@iocm.vn',
        twoFactor: false,
        twoFactorSecret: null,
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)
      mockDb.user.update.mockResolvedValue(mockUser)

      const caller = createCaller(
        createAuthenticatedContext(mockDb, 'user-1', ['Viewer']) as any
      )
      const result = await caller.auth.setup2FA()

      expect(result.secret).toBe('TESTSECRET')
      expect(result.uri).toBe('otpauth://...')
      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorSecret: 'TESTSECRET' },
      })
    })

    it('should throw if 2FA already enabled', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@iocm.vn',
        twoFactor: true,
        twoFactorSecret: 'EXISTING',
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)

      const caller = createCaller(
        createAuthenticatedContext(mockDb, 'user-1', ['Viewer']) as any
      )

      await expect(caller.auth.setup2FA()).rejects.toThrow(TRPCError)
    })
  })

  describe('verify2FA', () => {
    it('should enable 2FA on valid token', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@iocm.vn',
        twoFactor: false,
        twoFactorSecret: 'TESTSECRET',
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)
      mockDb.user.update.mockResolvedValue(mockUser)

      const caller = createCaller(
        createAuthenticatedContext(mockDb, 'user-1', ['Viewer']) as any
      )
      const result = await caller.auth.verify2FA({ token: '123456' })

      expect(result.success).toBe(true)
      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactor: true },
      })
    })

    it('should reject invalid token', async () => {
      const { verifyTOTP } = await import('@/lib/totp')
      ;(verifyTOTP as any).mockReturnValueOnce(false)

      const mockUser = {
        id: 'user-1',
        email: 'user@iocm.vn',
        twoFactor: false,
        twoFactorSecret: 'TESTSECRET',
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)

      const caller = createCaller(
        createAuthenticatedContext(mockDb, 'user-1', ['Viewer']) as any
      )
      const result = await caller.auth.verify2FA({ token: '000000' })

      expect(result.success).toBe(false)
    })
  })

  describe('disable2FA', () => {
    it('should disable 2FA with correct password', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@iocm.vn',
        twoFactor: true,
        twoFactorSecret: 'TESTSECRET',
        passwordHash: '$2b$12$hash',
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)
      ;(bcrypt.compare as any).mockResolvedValue(true)
      mockDb.user.update.mockResolvedValue(mockUser)

      const caller = createCaller(
        createAuthenticatedContext(mockDb, 'user-1', ['Viewer']) as any
      )
      const result = await caller.auth.disable2FA({ password: 'ValidPass1' })

      expect(result.success).toBe(true)
      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactor: false, twoFactorSecret: null },
      })
    })

    it('should reject with wrong password', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@iocm.vn',
        twoFactor: true,
        twoFactorSecret: 'TESTSECRET',
        passwordHash: '$2b$12$hash',
      }

      mockDb.user.findUnique.mockResolvedValue(mockUser)
      ;(bcrypt.compare as any).mockResolvedValue(false)

      const caller = createCaller(
        createAuthenticatedContext(mockDb, 'user-1', ['Viewer']) as any
      )
      const result = await caller.auth.disable2FA({ password: 'WrongPass1' })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('không đúng')
      }
    })
  })
})


// --- Users Router Tests (RBAC) -----------------------------------------------

describe('usersRouter', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  function createCaller(ctx: any) {
    const appRouter = router({ users: usersRouter })
    return appRouter.createCaller(ctx)
  }

  // --- Test 4: Permission denied — non-admin cannot access users.list --------

  describe('RBAC - permission denied', () => {
    it('should deny access to users.list for non-admin user', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-2', ['Viewer'])
      const caller = createCaller(ctx)

      await expect(caller.users.list()).rejects.toThrow(TRPCError)
      await expect(caller.users.list()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('should deny access to users.create for Enterprise_Member', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-3', ['Enterprise_Member'])
      const caller = createCaller(ctx)

      await expect(
        caller.users.create({
          name: 'New User',
          email: 'new@iocm.vn',
          password: 'ValidPass1',
        })
      ).rejects.toThrow(TRPCError)
      await expect(
        caller.users.create({
          name: 'New User',
          email: 'new@iocm.vn',
          password: 'ValidPass1',
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('should deny access to users.list for unauthenticated user', async () => {
      const ctx = createPublicContext(mockDb)
      const caller = createCaller(ctx)

      await expect(caller.users.list()).rejects.toThrow(TRPCError)
      await expect(caller.users.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })
  })

  // --- Test 5: Role check — System_Admin can access users.list ---------------

  describe('RBAC - System_Admin access', () => {
    it('should allow System_Admin to access users.list', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['System_Admin'])

      mockDb.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'user1@iocm.vn',
          name: 'User 1',
          phone: null,
          status: 'ACTIVE',
          twoFactor: false,
          createdAt: new Date(),
          roles: [
            { id: 'ur-1', role: { id: 'r-1', name: 'Viewer' }, scope: 'org' },
          ],
        },
      ])

      const caller = createCaller(ctx)
      const result = await caller.users.list()

      expect(result).toHaveLength(1)
      expect(result[0]!.email).toBe('user1@iocm.vn')
      expect(result[0]!.roles[0]!.roleName).toBe('Viewer')
    })

    it('should allow System_Admin to create users', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['System_Admin'])

      mockDb.user.findUnique.mockResolvedValue(null) // No existing user
      mockDb.user.create.mockResolvedValue({
        id: 'new-user-1',
        email: 'newuser@iocm.vn',
        name: 'New User',
        roles: [{ id: 'ur-1', role: { id: 'r-1', name: 'Viewer' }, scope: 'org' }],
      })
      mockDb.auditLog.create.mockResolvedValue({})

      const caller = createCaller(ctx)
      const result = await caller.users.create({
        name: 'New User',
        email: 'newuser@iocm.vn',
        password: 'ValidPass1',
        roleIds: ['r-1'],
      })

      expect(result.id).toBe('new-user-1')
      expect(result.email).toBe('newuser@iocm.vn')
      expect(mockDb.auditLog.create).toHaveBeenCalled()
    })
  })

  // --- Test 7: Duplicate email — creating user with existing email fails -----

  describe('Duplicate email', () => {
    it('should throw CONFLICT when creating user with existing email', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['System_Admin'])

      // Simulate existing user with same email
      mockDb.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'duplicate@iocm.vn',
        name: 'Existing User',
      })

      const caller = createCaller(ctx)

      await expect(
        caller.users.create({
          name: 'Another User',
          email: 'duplicate@iocm.vn',
          password: 'ValidPass1',
        })
      ).rejects.toThrow(TRPCError)

      await expect(
        caller.users.create({
          name: 'Another User',
          email: 'duplicate@iocm.vn',
          password: 'ValidPass1',
        })
      ).rejects.toMatchObject({
        code: 'CONFLICT',
      })
    })
  })

  // --- Password validation on user creation ----------------------------------

  describe('Password validation on create', () => {
    it('should reject weak password when creating user', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['System_Admin'])
      const caller = createCaller(ctx)

      // Too short
      await expect(
        caller.users.create({
          name: 'User',
          email: 'user@iocm.vn',
          password: 'Ab1',
        })
      ).rejects.toThrow()

      // No uppercase
      await expect(
        caller.users.create({
          name: 'User',
          email: 'user@iocm.vn',
          password: 'alllowercase1',
        })
      ).rejects.toThrow()

      // No number
      await expect(
        caller.users.create({
          name: 'User',
          email: 'user@iocm.vn',
          password: 'NoNumberHere',
        })
      ).rejects.toThrow()
    })
  })
})
