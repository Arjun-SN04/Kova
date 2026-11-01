import crypto from "node:crypto"
import bcrypt from "bcryptjs"
import User from "../models/user.model.js"
import { maskEmail, sendMail } from "./mailer.js"
import { codeEmail } from "./emailTemplates.js"

// One-time 6-digit codes sent by email: reset a forgotten login password, or confirm deleting the account.
export const PURPOSES = {
  password: "password",
  delete: "account deletion",
}
const TTL = 10 * 60_000
const RESEND_AFTER = 60_000
const MAX_TRIES = 5

// Make a code, save its hash on the user and email it.
// `who` is { userId } or { email }. An unknown email still answers ok, so the
// form can't be used to find out who has an account.
export const issueCode = async (who, purpose) => {
  if (!PURPOSES[purpose]) return { ok: false, status: 400, error: "Unknown request" }
  const query = who.userId ? { _id: who.userId } : { email: String(who.email || "").trim() }
  const me = await User.findOne({ ...query, isBot: { $ne: true } }).select("fullName email securityCode")
  if (!me) return { ok: true, sentTo: maskEmail(who.email) }
  const prev = me.securityCode
  if (prev?.purpose === purpose && prev.sentAt && Date.now() - prev.sentAt.getTime() < RESEND_AFTER) {
    return { ok: false, status: 429, error: "We just sent a code. Wait a minute before asking again." }
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0")
  me.securityCode = { purpose, hash: await bcrypt.hash(code, 10), expires: new Date(Date.now() + TTL), tries: 0, sentAt: new Date() }
  await me.save()
  const mail = codeEmail({ purpose, name: me.fullName?.split(" ")[0], code, email: me.email, minutes: TTL / 60_000 })
  try {
    await sendMail({ to: me.email, ...mail })
  } catch (error) {
    console.log("issueCode mail error:", error.message)
    return { ok: false, status: 502, error: "We couldn't send the email. Try again later." }
  }
  return { ok: true, sentTo: maskEmail(me.email) }
}

// Check a code and use it up. `me` must have securityCode selected; caller saves.
export const useCode = async (me, purpose, code) => {
  const c = me.securityCode
  if (!c?.hash || c.purpose !== purpose || !c.expires || c.expires < new Date()) return { ok: false, error: "That code has expired. Send a new one." }
  if (c.tries >= MAX_TRIES) return { ok: false, error: "Too many wrong tries. Send a new code." }
  const ok = /^\d{6}$/.test(String(code || "")) && await bcrypt.compare(String(code), c.hash)
  if (!ok) {
    me.securityCode.tries = (c.tries || 0) + 1
    await me.save()
    return { ok: false, error: "That email code isn't right" }
  }
  me.securityCode = undefined
  return { ok: true }
}
