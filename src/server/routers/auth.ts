import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { router, publicProcedure, protectedProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { generateTOTPSecret, verifyTOTP } from '@/lib/totp'

export const authRouter = router({
  /**
   * Login mutation — validates credentials against DB directly.
   * If 2FA is enabled, returns requiresTwoFactor: true so the client
   * can prompt for TOTP code before calling NextAuth signIn.
   */
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email('Email không hợp lệ'),
        password: z.string().min(1, 'Mật khẩu không được để trống'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { email: input.email },
        include: { roles: { include: { role: true } } },
      })

      if (!user) {
        return { success: false as const, error: 'Email hoặc mật khẩu không đúng' }
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return {
          success: false as const,
          error: 'Tài khoản đã bị khóa tạm thời. Vui lòng thử lại sau.',
        }
      }

      // Check account status
      if (user.status !== 'ACTIVE') {
        return {
          success: false as const,
          error: 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.',
        }
      }

      const passwordMatch = await bcrypt.compare(input.password, user.passwordHash)

      if (!passwordMatch) {
        // Increment failed login count
        const newFailedCount = user.failedLogins + 1
        const updateData: { failedLogins: number; lockedUntil?: Date } = {
          failedLogins: newFailedCount,
        }

        // Lock account after 5 failed attempts (30 min)
        if (newFailedCount >= 5) {
          updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000)
        }

        await ctx.db.user.update({
          where: { id: user.id },
          data: updateData,
        })

        return { success: false as const, error: 'Email hoặc mật khẩu không đúng' }
      }

      // Reset failed logins on success
      await ctx.db.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: null },
      })

      // If 2FA is enabled, don't complete login yet — require TOTP verification
      if (user.twoFactor && user.twoFactorSecret) {
        return {
          success: true as const,
          requiresTwoFactor: true as const,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            roles: user.roles.map((ur) => ur.role.name),
          },
        }
      }

      return {
        success: true as const,
        requiresTwoFactor: false as const,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles.map((ur) => ur.role.name),
        },
      }
    }),

  /**
   * Verify 2FA during login — verifies TOTP token for a user with 2FA enabled.
   * Called after successful password verification when requiresTwoFactor is true.
   */
  verifyLoginTOTP: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        token: z.string().length(6, 'Mã xác thực phải có 6 chữ số'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { email: input.email },
      })

      if (!user || !user.twoFactor || !user.twoFactorSecret) {
        return { success: false as const, error: 'Yêu cầu không hợp lệ.' }
      }

      const isValid = verifyTOTP(user.twoFactorSecret, input.token)

      if (!isValid) {
        return { success: false as const, error: 'Mã xác thực không đúng. Vui lòng thử lại.' }
      }

      return { success: true as const }
    }),

  /**
   * Logout mutation — invalidates session server-side.
   */
  logout: protectedProcedure.mutation(async () => {
    return { success: true }
  }),

  /**
   * Me query — returns current authenticated user's session info.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      include: { roles: { include: { role: true } } },
    })

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Không tìm thấy thông tin người dùng',
      })
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      status: user.status,
      twoFactor: user.twoFactor,
      roles: user.roles.map((ur) => ({
        name: ur.role.name,
        scope: ur.scope,
      })),
      createdAt: user.createdAt,
    }
  }),

  /**
   * Update profile — allows user to update their own name and phone.
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Tên không được để trống'),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
      })

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Không tìm thấy thông tin người dùng',
        })
      }

      await ctx.db.user.update({
        where: { id: user.id },
        data: {
          name: input.name,
          phone: input.phone ?? null,
        },
      })

      return { success: true as const }
    }),

  /**
   * Change password mutation — verifies old password, hashes new, updates DB.
   */
  changePassword: protectedProcedure
    .input(
      z.object({
        oldPassword: z.string().min(1, 'Mật khẩu cũ không được để trống'),
        newPassword: z
          .string()
          .min(8, 'Mật khẩu mới phải có ít nhất 8 ký tự')
          .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường và 1 số'
          ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
      })

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Không tìm thấy thông tin người dùng',
        })
      }

      // Verify old password
      const oldPasswordMatch = await bcrypt.compare(input.oldPassword, user.passwordHash)
      if (!oldPasswordMatch) {
        return { success: false as const, error: 'Mật khẩu cũ không đúng' }
      }

      // Prevent reusing the same password
      const sameAsOld = await bcrypt.compare(input.newPassword, user.passwordHash)
      if (sameAsOld) {
        return { success: false as const, error: 'Mật khẩu mới không được trùng với mật khẩu cũ' }
      }

      // Hash and update
      const newHash = await bcrypt.hash(input.newPassword, 12)
      await ctx.db.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      })

      return { success: true as const }
    }),

  /**
   * Setup 2FA — generates TOTP secret, stores it on the user (not yet enabled).
   * Returns the otpauth URI for QR code display.
   */
  setup2FA: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
    })

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Không tìm thấy thông tin người dùng',
      })
    }

    if (user.twoFactor) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: '2FA đã được kích hoạt. Vui lòng tắt trước khi thiết lập lại.',
      })
    }

    const { secret, uri } = generateTOTPSecret(user.email)

    // Store secret temporarily (2FA not enabled until verified)
    await ctx.db.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret },
    })

    return { uri, secret }
  }),

  /**
   * Verify 2FA — verifies the TOTP token and enables 2FA on the account.
   */
  verify2FA: protectedProcedure
    .input(
      z.object({
        token: z.string().length(6, 'Mã xác thực phải có 6 chữ số'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
      })

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Không tìm thấy thông tin người dùng',
        })
      }

      if (!user.twoFactorSecret) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Chưa thiết lập 2FA. Vui lòng gọi setup2FA trước.',
        })
      }

      if (user.twoFactor) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '2FA đã được kích hoạt rồi.',
        })
      }

      const isValid = verifyTOTP(user.twoFactorSecret, input.token)

      if (!isValid) {
        return { success: false as const, error: 'Mã xác thực không đúng. Vui lòng thử lại.' }
      }

      // Enable 2FA
      await ctx.db.user.update({
        where: { id: user.id },
        data: { twoFactor: true },
      })

      return { success: true as const }
    }),

  /**
   * Disable 2FA — requires password confirmation.
   */
  disable2FA: protectedProcedure
    .input(
      z.object({
        password: z.string().min(1, 'Mật khẩu không được để trống'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
      })

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Không tìm thấy thông tin người dùng',
        })
      }

      if (!user.twoFactor) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '2FA chưa được kích hoạt.',
        })
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(input.password, user.passwordHash)
      if (!passwordMatch) {
        return { success: false as const, error: 'Mật khẩu không đúng.' }
      }

      // Disable 2FA and clear secret
      await ctx.db.user.update({
        where: { id: user.id },
        data: { twoFactor: false, twoFactorSecret: null },
      })

      return { success: true as const }
    }),
})
