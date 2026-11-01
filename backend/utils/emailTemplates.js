import path from "node:path"
import { fileURLToPath } from "node:url"

// Email templates. Built with tables and inline styles so they look the same in
// Gmail, Outlook, Apple Mail and phones. The logo is attached to the email
// (cid:kova-logo) because Gmail blocks SVG and linked images are often hidden.

const here = path.dirname(fileURLToPath(import.meta.url))
export const LOGO = { filename: "kova.png", path: path.join(here, "../assets/kova-logo.png"), cid: "kova-logo" }

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif"
const MONO = "'SF Mono','JetBrains Mono',Menlo,Consolas,monospace"
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
// Stop mail apps from turning an address into a blue link
const noLink = (s) => esc(s).replace("@", "&#8203;@&#8203;").replace(/\./g, "&#8203;.")

// Dark theme colours
const C = {
  page: "#0a0b10",
  card: "#12141b",
  line: "#23262f",
  panel: "#0d0f15",
  text: "#f1f2f6",
  soft: "#a0a5b5",
  faint: "#6b7083",
  accent: "#8b93ff",
}

const year = () => new Date().getFullYear()
const stamp = () => new Date().toUTCString().replace("GMT", "UTC")
export const appUrl = (path = "") => `${(process.env.FRONTEND_URL || "http://localhost:5173").split(",")[0].trim().replace(/\/$/, "")}${path}`

// ── Building blocks ──
const p = (html, extra = "") => `<p style="margin:12px 0 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.soft};${extra}">${html}</p>`

const codePanel = (code, label = "VERIFICATION CODE") => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;background:${C.panel};border:1px solid ${C.line};border-radius:12px">
    <tr><td align="center" style="padding:22px 16px 6px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:1.6px;color:${C.faint}">${esc(label)}</td></tr>
    <tr><td align="center" style="padding:0 16px 22px;font-family:${MONO};font-size:34px;line-height:44px;font-weight:600;letter-spacing:8px;color:#ffffff">${esc(String(code).split("").join(" "))}</td></tr>
  </table>`

const button = (url, label) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px"><tr>
    <td style="border-radius:10px;background:#5b5bf6">
      <a href="${esc(url)}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${esc(label)}</a>
    </td>
  </tr></table>`

const note = (html) => `
  <div style="margin-top:28px;height:1px;background:${C.line};line-height:1px;font-size:0">&nbsp;</div>
  <p style="margin:20px 0 0;font-family:${FONT};font-size:13px;line-height:21px;color:${C.soft}">${html}</p>`

// Page frame: logo, card with title + body, footer
const layout = ({ preheader, title, body, email }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(title)}</title>
<style>:root{color-scheme:dark}</style>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}">
    <tr><td align="center" style="padding:48px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
        <tr><td style="padding:0 4px 24px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle"><img src="cid:${LOGO.cid}" width="32" height="32" alt="" style="display:block;border:0;border-radius:9px"></td>
            <td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:-0.3px;color:${C.text}">Kova</td>
          </tr></table>
        </td></tr>
        <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:36px">
          <h1 style="margin:0;font-family:${FONT};font-size:22px;line-height:30px;font-weight:600;letter-spacing:-0.3px;color:${C.text}">${esc(title)}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:24px 4px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${C.faint}">
          This email was sent to <span style="color:${C.soft}">${noLink(email)}</span> on ${esc(stamp())}.<br>
          © ${year()} Kova. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const mail = ({ subject, text, preheader, title, body, email }) => ({ subject, text, html: layout({ preheader, title, body, email }), attachments: [LOGO] })

// ── Emails ──

// One-time code: reset password or confirm account deletion
const CODE_COPY = {
  password: {
    title: "Reset your password",
    intro: "we received a request to reset the password for your Kova account. Use the verification code below to continue.",
    after: "If you didn’t request this, you can safely ignore this email. Your password won’t change, and no one can change it without this code. Kova will never ask you to share it.",
    subject: (c) => `${c} is your Kova password reset code`,
  },
  delete: {
    title: "Confirm account deletion",
    intro: "use this code to confirm that you want to delete your Kova account. Your account will be deleted after 30 days, and you can cancel any time before then by signing in.",
    after: "If you didn’t request this, change your password now. Your account stays as it is unless this code is used. Kova will never ask you to share it.",
    subject: (c) => `${c} is your Kova account deletion code`,
  },
}
export const codeEmail = ({ purpose = "password", name, code, email, minutes = 10 }) => {
  const c = CODE_COPY[purpose] || CODE_COPY.password
  return mail({
    subject: c.subject(code),
    preheader: `Your Kova code is ${code}. It expires in ${minutes} minutes.`,
    title: c.title,
    email,
    text: `Hi ${name || "there"},\n\n${c.title}: ${code}\nIt expires in ${minutes} minutes and can be used once.\n\n${c.after.replace(/’/g, "'")}\n\n— The Kova team`,
    body: p(`Hi ${esc(name || "there")}, ${c.intro}`)
      + codePanel(code)
      + p(`This code expires in ${minutes} minutes and can only be used once.`, `font-size:13px;line-height:20px;color:${C.faint};margin-top:16px`)
      + note(c.after),
  })
}
// Kept for the existing password reset flow
export const resetCodeEmail = (args) => codeEmail({ ...args, purpose: "password" })

// Data export is ready to download
export const exportReadyEmail = ({ name, email, url, sizeLabel, hours = 24 }) => mail({
  subject: "Your Kova data is ready to download",
  preheader: `Your Kova export (${sizeLabel}) is ready. The link works for ${hours} hours.`,
  title: "Your data is ready",
  email,
  text: `Hi ${name || "there"},\n\nYour Kova data export (${sizeLabel}) is ready:\n${url}\n\nThe link works for ${hours} hours, and only while you're signed in to Kova.\n\n— The Kova team`,
  body: p(`Hi ${esc(name || "there")}, the copy of your Kova data you asked for is ready. It includes your profile, contacts, chats and the photos and files you’ve shared.`)
    + button(url, `Download ZIP · ${sizeLabel}`)
    + p(`The link works for ${hours} hours, and only while you’re signed in to Kova.`, `font-size:13px;line-height:20px;color:${C.faint};margin-top:16px`)
    + note("If you didn’t ask for this, change your password. The download only works for someone signed in to your account."),
})

// Account deletion scheduled
export const deletionScheduledEmail = ({ name, email, when }) => mail({
  subject: "Your Kova account will be deleted",
  preheader: `Your account will be deleted on ${when}. Sign in before then to keep it.`,
  title: "Your account is scheduled for deletion",
  email,
  text: `Hi ${name || "there"},\n\nYour Kova account will be permanently deleted on ${when}.\nChanged your mind? Just sign in before then and the deletion is cancelled.\n\n— The Kova team`,
  body: p(`Hi ${esc(name || "there")}, your Kova account will be permanently deleted on <strong style="color:${C.text}">${esc(when)}</strong>. After that your profile, chats and files are removed and can’t be recovered.`)
    + p("Changed your mind? Sign in any time before then and the deletion is cancelled.")
    + button(appUrl("/login"), "Keep my account")
    + note("If you didn’t ask for this, sign in now and change your password."),
})

// Daily digest of unread messages. chats: [{ name, count, preview }]
export const digestEmail = ({ name, email, chats, total }) => {
  const rows = chats.map((c) => `
    <tr><td style="padding:14px 0;border-top:1px solid ${C.line}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${FONT};font-size:14px;font-weight:600;color:${C.text}">${esc(c.name)}</td>
        <td align="right" style="font-family:${FONT};font-size:12px;font-weight:600;color:${C.accent};white-space:nowrap">${c.count} new</td>
      </tr><tr>
        <td colspan="2" style="padding-top:4px;font-family:${FONT};font-size:13px;line-height:20px;color:${C.soft}">${esc(c.preview)}</td>
      </tr></table>
    </td></tr>`).join("")
  return mail({
    subject: `You have ${total} unread message${total === 1 ? "" : "s"} on Kova`,
    preheader: chats.map((c) => c.name).slice(0, 3).join(", "),
    title: `${total} unread message${total === 1 ? "" : "s"}`,
    email,
    text: `Hi ${name || "there"},\n\nWhile you were away:\n${chats.map((c) => `- ${c.name}: ${c.count} new — ${c.preview}`).join("\n")}\n\nOpen Kova: ${appUrl("/")}\n\nTurn off these emails in Profile → Notifications.`,
    body: p(`Hi ${esc(name || "there")}, here’s what you missed while you were away.`)
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px">${rows}</table>`
      + button(appUrl("/"), "Open Kova")
      + note("You get this at most once a day, only when you have unread messages and haven’t opened Kova. Turn it off in Profile → Notifications."),
  })
}
