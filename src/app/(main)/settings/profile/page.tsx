'use client'

import { useState, useEffect, type FormEvent } from 'react'
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Typography,
  InputAdornment,
  IconButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import {
  PersonOutline,
  LockOutlined,
  SecurityOutlined,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material'
import { trpc } from '@/lib/trpc'

export default function ProfilePage() {
  // --- Profile state ---
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)

  // --- Password state ---
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  // --- 2FA state ---
  const [twoFASetupOpen, setTwoFASetupOpen] = useState(false)
  const [twoFADisableOpen, setTwoFADisableOpen] = useState(false)
  const [qrUri, setQrUri] = useState('')
  const [totpSecret, setTotpSecret] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [twoFAError, setTwoFAError] = useState('')
  const [twoFASuccess, setTwoFASuccess] = useState('')
  const [twoFALoading, setTwoFALoading] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')

  // --- Fetch current user ---
  const { data: user, isLoading: userLoading, refetch } = trpc.auth.me.useQuery()

  // --- tRPC mutations ---
  const updateProfileMutation = trpc.auth.updateProfile.useMutation()
  const changePasswordMutation = trpc.auth.changePassword.useMutation()
  const setup2FAMutation = trpc.auth.setup2FA.useMutation()
  const verify2FAMutation = trpc.auth.verify2FA.useMutation()
  const disable2FAMutation = trpc.auth.disable2FA.useMutation()

  // Populate form when user data loads
  useEffect(() => {
    if (user) {
      setName(user.name)
      setPhone(user.phone ?? '')
    }
  }, [user])

  // Generate QR code data URL when URI changes
  useEffect(() => {
    if (qrUri) {
      import('qrcode').then((QRCode) => {
        QRCode.toDataURL(qrUri, { width: 256, margin: 2 }).then((url: string) => {
          setQrDataUrl(url)
        })
      })
    }
  }, [qrUri])

  // --- Profile submit ---
  const handleProfileSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setProfileSuccess('')
    setProfileError('')

    if (!name.trim()) {
      setProfileError('Tên không được để trống')
      return
    }

    setProfileLoading(true)
    try {
      const result = await updateProfileMutation.mutateAsync({
        name: name.trim(),
        phone: phone.trim() || undefined,
      })
      if (result.success) {
        setProfileSuccess('Cập nhật thông tin thành công')
        refetch()
      }
    } catch {
      setProfileError('Đã xảy ra lỗi khi cập nhật thông tin')
    } finally {
      setProfileLoading(false)
    }
  }

  // --- Password submit ---
  const handlePasswordSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPasswordSuccess('')
    setPasswordError('')

    if (!oldPassword) {
      setPasswordError('Vui lòng nhập mật khẩu hiện tại')
      return
    }
    if (!newPassword) {
      setPasswordError('Vui lòng nhập mật khẩu mới')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('Mật khẩu mới phải có ít nhất 8 ký tự')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp')
      return
    }

    setPasswordLoading(true)
    try {
      const result = await changePasswordMutation.mutateAsync({
        oldPassword,
        newPassword,
      })
      if (result.success) {
        setPasswordSuccess('Đổi mật khẩu thành công')
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setPasswordError(result.error ?? 'Đổi mật khẩu thất bại')
      }
    } catch {
      setPasswordError('Đã xảy ra lỗi khi đổi mật khẩu')
    } finally {
      setPasswordLoading(false)
    }
  }

  // --- 2FA Setup ---
  const handleEnable2FA = async () => {
    setTwoFAError('')
    setTwoFASuccess('')
    setTwoFALoading(true)
    try {
      const result = await setup2FAMutation.mutateAsync()
      setQrUri(result.uri)
      setTotpSecret(result.secret)
      setTwoFASetupOpen(true)
    } catch {
      setTwoFAError('Không thể thiết lập 2FA. Vui lòng thử lại.')
    } finally {
      setTwoFALoading(false)
    }
  }

  const handleVerify2FA = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setTwoFAError('')
    setTwoFALoading(true)
    try {
      const result = await verify2FAMutation.mutateAsync({ token: totpCode })
      if (result.success) {
        setTwoFASuccess('Xác thực hai yếu tố đã được kích hoạt thành công!')
        setTwoFASetupOpen(false)
        setTotpCode('')
        setQrUri('')
        setTotpSecret('')
        setQrDataUrl('')
        refetch()
      } else {
        setTwoFAError(result.error ?? 'Mã xác thực không đúng.')
      }
    } catch {
      setTwoFAError('Đã xảy ra lỗi. Vui lòng thử lại.')
    } finally {
      setTwoFALoading(false)
    }
  }

  // --- 2FA Disable ---
  const handleDisable2FA = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setTwoFAError('')
    setTwoFALoading(true)
    try {
      const result = await disable2FAMutation.mutateAsync({ password: disablePassword })
      if (result.success) {
        setTwoFASuccess('Đã tắt xác thực hai yếu tố.')
        setTwoFADisableOpen(false)
        setDisablePassword('')
        refetch()
      } else {
        setTwoFAError(result.error ?? 'Mật khẩu không đúng.')
      }
    } catch {
      setTwoFAError('Đã xảy ra lỗi. Vui lòng thử lại.')
    } finally {
      setTwoFALoading(false)
    }
  }

  const handleCloseSetup = () => {
    setTwoFASetupOpen(false)
    setTotpCode('')
    setTwoFAError('')
    setQrUri('')
    setTotpSecret('')
    setQrDataUrl('')
  }

  const handleCloseDisable = () => {
    setTwoFADisableOpen(false)
    setDisablePassword('')
    setTwoFAError('')
  }

  if (userLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', py: 3, px: 2 }}>
      <Typography variant="h5" fontWeight={600} sx={{ mb: 3 }}>
        Hồ sơ cá nhân
      </Typography>

      {/* Section 1: Thông tin cá nhân */}
      <Card sx={{ mb: 3 }}>
        <CardHeader
          avatar={<PersonOutline color="primary" />}
          title="Thông tin cá nhân"
          titleTypographyProps={{ variant: 'h6', fontWeight: 500 }}
        />
        <Divider />
        <CardContent>
          {profileSuccess && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setProfileSuccess('')}>
              {profileSuccess}
            </Alert>
          )}
          {profileError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setProfileError('')}>
              {profileError}
            </Alert>
          )}

          <Box component="form" onSubmit={handleProfileSubmit} noValidate>
            <TextField
              label="Email"
              value={user?.email ?? ''}
              fullWidth
              disabled
              sx={{ mb: 2 }}
              helperText="Email không thể thay đổi"
            />
            <TextField
              label="Họ và tên"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              required
              disabled={profileLoading}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Số điện thoại"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
              disabled={profileLoading}
              sx={{ mb: 3 }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={profileLoading}
              startIcon={profileLoading ? <CircularProgress size={18} /> : undefined}
            >
              Lưu thay đổi
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Section 2: Đổi mật khẩu */}
      <Card sx={{ mb: 3 }}>
        <CardHeader
          avatar={<LockOutlined color="primary" />}
          title="Đổi mật khẩu"
          titleTypographyProps={{ variant: 'h6', fontWeight: 500 }}
        />
        <Divider />
        <CardContent>
          {passwordSuccess && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setPasswordSuccess('')}>
              {passwordSuccess}
            </Alert>
          )}
          {passwordError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPasswordError('')}>
              {passwordError}
            </Alert>
          )}

          <Box component="form" onSubmit={handlePasswordSubmit} noValidate>
            <TextField
              label="Mật khẩu hiện tại"
              type={showOldPassword ? 'text' : 'password'}
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              fullWidth
              required
              disabled={passwordLoading}
              autoComplete="current-password"
              sx={{ mb: 2 }}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showOldPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        onClick={() => setShowOldPassword(!showOldPassword)}
                        edge="end"
                        size="small"
                      >
                        {showOldPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              label="Mật khẩu mới"
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              fullWidth
              required
              disabled={passwordLoading}
              autoComplete="new-password"
              helperText="Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và số"
              sx={{ mb: 2 }}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showNewPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        edge="end"
                        size="small"
                      >
                        {showNewPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              label="Xác nhận mật khẩu mới"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              fullWidth
              required
              disabled={passwordLoading}
              autoComplete="new-password"
              sx={{ mb: 3 }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={passwordLoading}
              startIcon={passwordLoading ? <CircularProgress size={18} /> : undefined}
            >
              Đổi mật khẩu
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Section 3: Xác thực hai yếu tố (2FA) */}
      <Card>
        <CardHeader
          avatar={<SecurityOutlined color="primary" />}
          title="Xác thực hai yếu tố (2FA)"
          titleTypographyProps={{ variant: 'h6', fontWeight: 500 }}
        />
        <Divider />
        <CardContent>
          {twoFASuccess && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setTwoFASuccess('')}>
              {twoFASuccess}
            </Alert>
          )}
          {twoFAError && !twoFASetupOpen && !twoFADisableOpen && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setTwoFAError('')}>
              {twoFAError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="body1" fontWeight={500}>
                {user?.twoFactor ? 'Đã kích hoạt' : 'Chưa kích hoạt'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {user?.twoFactor
                  ? 'Tài khoản của bạn được bảo vệ bằng xác thực hai yếu tố.'
                  : 'Bật 2FA để tăng cường bảo mật tài khoản bằng mã TOTP.'}
              </Typography>
            </Box>
            {user?.twoFactor ? (
              <Button
                variant="outlined"
                color="error"
                onClick={() => setTwoFADisableOpen(true)}
                disabled={twoFALoading}
              >
                Tắt 2FA
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={handleEnable2FA}
                disabled={twoFALoading}
                startIcon={twoFALoading ? <CircularProgress size={18} /> : undefined}
              >
                Bật 2FA
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* 2FA Setup Dialog */}
      <Dialog open={twoFASetupOpen} onClose={handleCloseSetup} maxWidth="sm" fullWidth>
        <DialogTitle>Thiết lập xác thực hai yếu tố</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Quét mã QR bên dưới bằng ứng dụng xác thực (Google Authenticator, Authy, Microsoft
            Authenticator...), sau đó nhập mã 6 chữ số để xác nhận.
          </Typography>

          {qrDataUrl && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <img
                src={qrDataUrl}
                alt="QR Code cho 2FA"
                width={200}
                height={200}
                style={{ borderRadius: 8 }}
              />
            </Box>
          )}

          {totpSecret && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Hoặc nhập mã bí mật thủ công:
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'monospace',
                  bgcolor: 'grey.100',
                  p: 1,
                  borderRadius: 1,
                  wordBreak: 'break-all',
                  textAlign: 'center',
                  fontWeight: 600,
                }}
              >
                {totpSecret}
              </Typography>
            </Box>
          )}

          {twoFAError && twoFASetupOpen && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {twoFAError}
            </Alert>
          )}

          <Box component="form" id="verify-2fa-form" onSubmit={handleVerify2FA}>
            <TextField
              label="Mã xác thực (6 chữ số)"
              value={totpCode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                setTotpCode(val)
              }}
              fullWidth
              required
              autoFocus
              inputProps={{ maxLength: 6, inputMode: 'numeric', pattern: '[0-9]*' }}
              helperText="Nhập mã 6 chữ số từ ứng dụng xác thực"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseSetup} disabled={twoFALoading}>
            Hủy
          </Button>
          <Button
            type="submit"
            form="verify-2fa-form"
            variant="contained"
            disabled={twoFALoading || totpCode.length !== 6}
            startIcon={twoFALoading ? <CircularProgress size={18} /> : undefined}
          >
            Xác nhận kích hoạt
          </Button>
        </DialogActions>
      </Dialog>

      {/* 2FA Disable Dialog */}
      <Dialog open={twoFADisableOpen} onClose={handleCloseDisable} maxWidth="sm" fullWidth>
        <DialogTitle>Tắt xác thực hai yếu tố</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Nhập mật khẩu để xác nhận tắt xác thực hai yếu tố. Tài khoản sẽ chỉ được bảo vệ bằng
            mật khẩu.
          </Typography>

          {twoFAError && twoFADisableOpen && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {twoFAError}
            </Alert>
          )}

          <Box component="form" id="disable-2fa-form" onSubmit={handleDisable2FA}>
            <TextField
              label="Mật khẩu"
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              fullWidth
              required
              autoFocus
              autoComplete="current-password"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDisable} disabled={twoFALoading}>
            Hủy
          </Button>
          <Button
            type="submit"
            form="disable-2fa-form"
            variant="contained"
            color="error"
            disabled={twoFALoading || !disablePassword}
            startIcon={twoFALoading ? <CircularProgress size={18} /> : undefined}
          >
            Xác nhận tắt 2FA
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
