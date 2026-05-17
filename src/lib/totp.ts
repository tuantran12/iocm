import * as OTPAuth from 'otpauth'

const ISSUER = 'IOCM'

/**
 * Generates a new TOTP secret for a user.
 * Returns the secret (base32), the otpauth URI, and a QR code URL (via Google Charts API).
 */
export function generateTOTPSecret(email: string) {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  })

  const secret = totp.secret.base32
  const uri = totp.toString()

  return { secret, uri }
}

/**
 * Verifies a TOTP token against the stored secret.
 * Allows a window of ±1 period (30s) to account for clock drift.
 */
export function verifyTOTP(secret: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  })

  // validate returns the time step difference (null if invalid)
  const delta = totp.validate({ token, window: 1 })
  return delta !== null
}
