'use client'

import { useState, type FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
  Link as MuiLink,
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  LockOutlined,
  ArrowBack,
} from '@mui/icons-material'
import NextLink from 'next/link'
import { trpc } from '@/lib/trpc'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false)
  const [totpCode, setTotpCode] = useState('')

  const loginMutation = trpc.auth.login.useMutation()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('Vui lòng nhập email')
      return
    }

    if (!password) {
      setError('Vui lòng nhập mật khẩu')
      return
    }

    setLoading(true)

    try {
      const result = await loginMutation.mutateAsync({
        email: email.trim(),
        password,
      })

      if (!result.success) {
        setError(result.error ?? 'Email hoặc mật khẩu không đúng.')
        setLoading(false)
        return
      }

      if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
        setRequires2FA(true)
        setLoading(false)
        return
      }

      await completeSignIn()
    } catch {
      setError('Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.')
      setLoading(false)
    }
  }

  const handleTOTPSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (!totpCode || totpCode.length !== 6) {
      setError('Vui lòng nhập mã xác thực 6 chữ số')
      return
    }

    setLoading(true)
    await completeSignIn(totpCode)
  }

  const completeSignIn = async (totp?: string) => {
    try {
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        totpCode: totp,
        redirect: false,
      })

      if (result?.error) {
        setError(
          requires2FA
            ? 'Mã xác thực không đúng hoặc đã hết hạn.'
            : 'Đăng nhập thất bại. Vui lòng thử lại.'
        )
      } else if (result?.ok) {
        router.push('/founding')
        router.refresh()
      }
    } catch {
      setError('Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setRequires2FA(false)
    setTotpCode('')
    setError('')
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 420, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <LockOutlined sx={{ color: 'white', fontSize: 24 }} />
            </Box>
            <Typography variant="h5" component="h1" fontWeight={600}>
              {requires2FA ? 'Xác thực hai yếu tố' : 'Đăng nhập'}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {requires2FA ? (
            <Box component="form" onSubmit={handleTOTPSubmit} noValidate>
              <TextField
                label="Mã xác thực (6 chữ số)"
                type="text"
                fullWidth
                required
                value={totpCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setTotpCode(val)
                }}
                disabled={loading}
                autoComplete="one-time-code"
                autoFocus
                inputProps={{ maxLength: 6, inputMode: 'numeric', pattern: '[0-9]*' }}
                sx={{ mb: 3 }}
              />

              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading || totpCode.length !== 6}
                sx={{ mb: 2, py: 1.2 }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Xác nhận'}
              </Button>

              <Button
                variant="text"
                fullWidth
                startIcon={<ArrowBack />}
                onClick={handleBack}
                disabled={loading}
              >
                Quay lại
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleSubmit} noValidate>
              <TextField
                label="Email"
                type="email"
                fullWidth
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                autoFocus
                sx={{ mb: 2 }}
              />

              <TextField
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                sx={{ mb: 3 }}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                          disabled={loading}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading}
                sx={{ mb: 2, py: 1.2 }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Đăng nhập'}
              </Button>

              <Box sx={{ textAlign: 'center' }}>
                <MuiLink
                  component={NextLink}
                  href="/forgot-password"
                  variant="body2"
                  underline="hover"
                >
                  Quên mật khẩu?
                </MuiLink>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
