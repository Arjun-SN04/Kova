import nodemailer from "nodemailer"

// Sends email through any SMTP server (Gmail, Brevo, Resend, Mailgun…).
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and optionally MAIL_FROM in .env.
// Without them, emails are printed to the server console instead (handy in development).
let transport = null
const getTransport = () => {
  if (transport) return transport
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null
  const port = Number(process.env.SMTP_PORT || 465)
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  return transport
}

export const mailConfigured = () => !!getTransport()

export const sendMail = async ({ to, subject, text, html, attachments }) => {
  const t = getTransport()
  if (!t) {
    console.log(`\n[mail] SMTP not set up. Email to ${to}\n  Subject: ${subject}\n  ${text}\n`)
    return { sent: false }
  }
  await t.sendMail({ from: process.env.MAIL_FROM || `Kova <${process.env.SMTP_USER}>`, to, subject, text, html, attachments })
  return { sent: true }
}

// "arjun@gmail.com" -> "a***n@gmail.com"
export const maskEmail = (email = "") => {
  const [name, domain] = String(email).split("@")
  if (!domain) return email
  const shown = name.length <= 2 ? name[0] + "***" : `${name[0]}***${name[name.length - 1]}`
  return `${shown}@${domain}`
}
