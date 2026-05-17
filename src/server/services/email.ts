import * as nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

/**
 * Email Service — Gửi email thông báo cho người dùng IOCM.
 *
 * - Dev: log ra console (không gửi thật)
 * - Production: sử dụng SMTP từ env vars
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text?: string
}

export interface NotificationEmailInput {
  type: string
  title: string
  message?: string | null
  link?: string | null
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  previewUrl?: string | null
}

// ─── Vietnamese Email Templates ───────────────────────────────────────────────

const NOTIFICATION_EMAIL_TEMPLATES: Record<string, (msg?: string | null, link?: string | null) => { subject: string; html: string; text: string }> = {
  DOCUMENT_OVERDUE: (msg, link) => ({
    subject: '⚠️ Tài liệu quá hạn — IOCM',
    html: buildHtml('Tài liệu quá hạn', msg || 'Một tài liệu đã quá hạn hoàn thành. Vui lòng kiểm tra và cập nhật.', link),
    text: `Tài liệu quá hạn\n\n${msg || 'Một tài liệu đã quá hạn hoàn thành. Vui lòng kiểm tra và cập nhật.'}`,
  }),
  DOCUMENT_APPROVED: (msg, link) => ({
    subject: '✅ Tài liệu đã được phê duyệt — IOCM',
    html: buildHtml('Tài liệu đã được phê duyệt', msg || 'Tài liệu của bạn đã được phê duyệt thành công.', link),
    text: `Tài liệu đã được phê duyệt\n\n${msg || 'Tài liệu của bạn đã được phê duyệt thành công.'}`,
  }),
  DOCUMENT_REJECTED: (msg, link) => ({
    subject: '❌ Tài liệu bị từ chối — IOCM',
    html: buildHtml('Tài liệu bị từ chối', msg || 'Tài liệu của bạn đã bị từ chối. Vui lòng xem lý do và chỉnh sửa.', link),
    text: `Tài liệu bị từ chối\n\n${msg || 'Tài liệu của bạn đã bị từ chối. Vui lòng xem lý do và chỉnh sửa.'}`,
  }),
  FEE_OVERDUE: (msg, link) => ({
    subject: '⚠️ Phí thường niên quá hạn — IOCM',
    html: buildHtml('Phí thường niên quá hạn', msg || 'Phí thường niên của doanh nghiệp đã quá hạn thanh toán.', link),
    text: `Phí thường niên quá hạn\n\n${msg || 'Phí thường niên của doanh nghiệp đã quá hạn thanh toán.'}`,
  }),
  FEE_PAID: (msg, link) => ({
    subject: '✅ Phí thường niên đã thanh toán — IOCM',
    html: buildHtml('Phí thường niên đã thanh toán', msg || 'Phí thường niên đã được ghi nhận thanh toán thành công.', link),
    text: `Phí thường niên đã thanh toán\n\n${msg || 'Phí thường niên đã được ghi nhận thanh toán thành công.'}`,
  }),
  CONTRACT_EXPIRING: (msg, link) => ({
    subject: '⚠️ Hợp đồng sắp hết hạn — IOCM',
    html: buildHtml('Hợp đồng sắp hết hạn', msg || 'Một hợp đồng sắp hết hạn. Vui lòng xem xét gia hạn hoặc kết thúc.', link),
    text: `Hợp đồng sắp hết hạn\n\n${msg || 'Một hợp đồng sắp hết hạn. Vui lòng xem xét gia hạn hoặc kết thúc.'}`,
  }),
  KPI_OFF_TRACK: (msg, link) => ({
    subject: '⚠️ KPI chưa đạt mục tiêu — IOCM',
    html: buildHtml('KPI chưa đạt mục tiêu', msg || 'Một chỉ số KPI đang không đạt mục tiêu đề ra.', link),
    text: `KPI chưa đạt mục tiêu\n\n${msg || 'Một chỉ số KPI đang không đạt mục tiêu đề ra.'}`,
  }),
  CONSENT_WITHDRAWN: (msg, link) => ({
    subject: '🔒 Rút lại đồng ý thu thập dữ liệu — IOCM',
    html: buildHtml('Rút lại đồng ý thu thập dữ liệu', msg || 'Một chủ thể dữ liệu đã rút lại đồng ý. Cần xử lý theo quy trình.', link),
    text: `Rút lại đồng ý thu thập dữ liệu\n\n${msg || 'Một chủ thể dữ liệu đã rút lại đồng ý. Cần xử lý theo quy trình.'}`,
  }),
  TASK_ASSIGNED: (msg, link) => ({
    subject: '📋 Công việc mới được giao — IOCM',
    html: buildHtml('Công việc mới được giao', msg || 'Bạn vừa được giao một công việc mới. Vui lòng kiểm tra chi tiết.', link),
    text: `Công việc mới được giao\n\n${msg || 'Bạn vừa được giao một công việc mới. Vui lòng kiểm tra chi tiết.'}`,
  }),
  TASK_OVERDUE: (msg, link) => ({
    subject: '⚠️ Công việc quá hạn — IOCM',
    html: buildHtml('Công việc quá hạn', msg || 'Một công việc đã quá hạn hoàn thành. Vui lòng cập nhật tiến độ.', link),
    text: `Công việc quá hạn\n\n${msg || 'Một công việc đã quá hạn hoàn thành. Vui lòng cập nhật tiến độ.'}`,
  }),
  EVENT_REMINDER: (msg, link) => ({
    subject: '📅 Nhắc nhở sự kiện — IOCM',
    html: buildHtml('Nhắc nhở sự kiện', msg || 'Bạn có một sự kiện sắp diễn ra. Vui lòng chuẩn bị.', link),
    text: `Nhắc nhở sự kiện\n\n${msg || 'Bạn có một sự kiện sắp diễn ra. Vui lòng chuẩn bị.'}`,
  }),
}

// ─── HTML Template Builder ────────────────────────────────────────────────────

function buildHtml(title: string, body: string, link?: string | null): string {
  const linkHtml = link
    ? `<p style="margin-top:16px;"><a href="${link}" style="background:#1976d2;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block;">Xem chi tiết</a></p>`
    : ''

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="border-bottom:3px solid #1976d2;padding-bottom:12px;margin-bottom:20px;">
    <h2 style="margin:0;color:#1976d2;">IOCM — Viện Nghiên cứu</h2>
  </div>
  <h3 style="margin:0 0 12px;">${title}</h3>
  <p style="line-height:1.6;">${body}</p>
  ${linkHtml}
  <hr style="margin-top:32px;border:none;border-top:1px solid #eee;">
  <p style="font-size:12px;color:#999;">Đây là email tự động từ hệ thống IOCM. Vui lòng không trả lời email này.</p>
</body>
</html>`
}

// ─── Transport Management ─────────────────────────────────────────────────────

let transporter: Transporter | null = null

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/**
 * Gets or creates the email transporter.
 * - Dev: logs to console (jsonTransport)
 * - Production: uses SMTP from env vars
 */
export function getTransporter(): Transporter {
  if (transporter) return transporter

  if (isDev()) {
    // Dev mode: use JSON transport (logs email content, doesn't send)
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    })
  } else {
    // Production: use SMTP from environment variables
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    })
  }

  return transporter!
}

/**
 * Resets the transporter (useful for testing).
 */
export function resetTransporter(): void {
  transporter = null
}

// ─── Public API ───────────────────────────────────────────────────────────────

const FROM_ADDRESS = process.env.EMAIL_FROM || 'IOCM <noreply@iocm.vn>'

/**
 * Sends a raw email with custom subject, html, and text.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const transport = getTransporter()

  try {
    const info = await transport.sendMail({
      from: FROM_ADDRESS,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text || '',
    })

    if (isDev()) {
      // In dev mode with jsonTransport, log the email content
      const parsed = JSON.parse(info.message)
      console.log('[EMAIL-DEV] ─────────────────────────────────────')
      console.log(`  Đến: ${parsed.to}`)
      console.log(`  Tiêu đề: ${parsed.subject}`)
      console.log(`  Nội dung: ${(parsed.text || '').substring(0, 100)}...`)
      console.log('─────────────────────────────────────────────────')
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: null,
    }
  } catch (error) {
    console.error('[EMAIL] Lỗi gửi email:', error)
    return { success: false }
  }
}

/**
 * Sends a notification as an email using Vietnamese templates.
 * Falls back to a generic template if the notification type is unknown.
 */
export async function sendNotificationEmail(
  userEmail: string,
  notification: NotificationEmailInput,
): Promise<SendEmailResult> {
  const templateFn = NOTIFICATION_EMAIL_TEMPLATES[notification.type]

  if (templateFn) {
    const template = templateFn(notification.message, notification.link)
    return sendEmail({
      to: userEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    })
  }

  // Fallback: generic notification email
  const title = notification.title || 'Thông báo mới'
  const body = notification.message || 'Bạn có một thông báo mới từ hệ thống IOCM.'
  return sendEmail({
    to: userEmail,
    subject: `${title} — IOCM`,
    html: buildHtml(title, body, notification.link),
    text: `${title}\n\n${body}`,
  })
}
