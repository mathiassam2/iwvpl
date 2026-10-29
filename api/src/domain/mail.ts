/**
 * Transactional email service for IWVPL.
 *
 * Uses nodemailer with cPanel SMTP / secure mail transport.
 */

import nodemailer, { type Transporter } from 'nodemailer'
import { config } from '../config.js'

let transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: {
        user: config.mail.user,
        pass: config.mail.pass,
      },
      tls: {
        // Accommodate self-signed or cPanel hosting certificates
        rejectUnauthorized: false,
      },
    })
  }
  return transporter
}

export async function sendPasswordResetEmail(to: string, resetUrl: string, name: string): Promise<void> {
  const mailer = getTransporter()

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - IWVPL</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0c0e12; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e4e7eb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0c0e12; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #161920; border: 1px solid #282d37; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 36px; background-color: #12141a; border-bottom: 1px solid #222631; text-align: center;">
              <span style="font-size: 24px; font-weight: 900; letter-spacing: 2px; color: #ffffff;">
                IWVPL<span style="color: #c6ff00;">.</span>
              </span>
              <p style="margin: 6px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #8892a0;">
                Inter-World Virtual Pro League
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 800; color: #ffffff;">
                Password Reset Request
              </h1>
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #b4bac5;">
                Hello <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #b4bac5;">
                We received a request to reset the password for your IWVPL account. Click the button below to set a new password:
              </p>

              <!-- Action Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 30px auto;">
                <tr>
                  <td align="center" style="border-radius: 10px; background-color: #c6ff00;">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 14px; font-weight: 800; color: #0c0e12; text-decoration: none; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Reset My Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 8px 0; font-size: 13px; line-height: 1.5; color: #8892a0;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px 0; font-size: 12px; word-break: break-all; color: #c6ff00;">
                <a href="${resetUrl}" style="color: #c6ff00; text-decoration: underline;">${resetUrl}</a>
              </p>

              <div style="margin-top: 32px; padding: 16px; background-color: #1c202a; border-radius: 8px; border-left: 3px solid #c6ff00;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #8892a0;">
                  ⏱ This reset link will expire in <strong>1 hour</strong>.<br>
                  🔒 If you did not make this request, you can safely ignore this email — your account remains secure.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 36px; background-color: #101217; border-top: 1px solid #222631; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #646f7f;">
                © ${new Date().getFullYear()} IWVPL. All rights reserved.<br>
                This is an automated security message sent to ${to}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  const text = `
Hello ${name},

We received a request to reset the password for your IWVPL account.

Please visit the link below to set a new password:
${resetUrl}

This link is valid for 1 hour. If you did not request a password reset, you can safely ignore this email.

— IWVPL League Administration
  `.trim()

  await mailer.sendMail({
    from: config.mail.from,
    to,
    subject: 'Reset Your Password - IWVPL',
    text,
    html,
  })
}
