import bcrypt from "bcryptjs"
import User from "../models/user.model.js"
import { issueCode, useCode } from "../utils/securityCode.js"
import { hashAnswer, proveRecovery, questionOk } from "../utils/recovery.js"
import { emitToUsers } from "../utils/notify.js"
import { passwordError } from "../utils/password.js"
import { disconnectUser } from "../socket/socket.js"
import { endSessions } from "../jwt/token.js"

const fail = (res, status, error) => res.status(status).json({ error })

// ── Forgot login password (no login needed): email a 6-digit code, then set a new password ──
export const forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim()
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, "Enter the email you signed up with")
    const r = await issueCode({ email }, "password")
    if (!r.ok) return fail(res, r.status, r.error)
    res.json({ sentTo: r.sentTo })
  } catch (error) {
    console.log("forgotPassword error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const resetPassword = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim()
    const password = String(req.body.password || "")
    const badPassword = passwordError(password)
    if (badPassword) return fail(res, 400, badPassword)
    const me = await User.findOne({ email, isBot: { $ne: true } }).select("password securityCode")
    if (!me) return fail(res, 400, "That code has expired. Send a new one.")
    const check = await useCode(me, "password", req.body.otp)
    if (!check.ok) return fail(res, 400, check.error)
    me.password = await bcrypt.hash(password, 10)
    // Whoever was signed in before (maybe with a stolen login) is signed out everywhere
    me.passwordChangedAt = new Date()
    await me.save()
    await endSessions(me._id)
    disconnectUser(me._id)
    res.json({ ok: true })
  } catch (error) {
    console.log("resetPassword error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Security question (for a forgotten lock code / secret word / app PIN) ──
// Setting or changing it needs the account password or the chat lock code,
// except the very first time when there's nothing to protect yet.
export const setSecurityQuestion = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("password lockCode securityQuestion securityAnswer")
    if (me.securityAnswer || me.lockCode) {
      const byPassword = req.body.password && await bcrypt.compare(String(req.body.password), me.password)
      const byCode = !byPassword && req.body.code && me.lockCode && await bcrypt.compare(String(req.body.code), me.lockCode)
      if (!byPassword && !byCode) return fail(res, 400, "Your password isn't right")
    }
    const bad = questionOk(req.body.question, req.body.answer)
    if (bad) return fail(res, 400, bad)
    me.securityQuestion = String(req.body.question).trim()
    me.securityAnswer = await hashAnswer(req.body.answer)
    await me.save()
    emitToUsers([me._id], "prefsUpdated", { securityQuestion: me.securityQuestion })
    res.json({ securityQuestion: me.securityQuestion })
  } catch (error) {
    console.log("setSecurityQuestion error:", error)
    fail(res, 500, "Internal server error")
  }
}

// App lock PIN lives only on the device, so the server just checks the answer / password
export const verifyRecovery = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("password securityAnswer")
    const check = await proveRecovery(me, req.body)
    if (!check.ok) return fail(res, 400, check.error)
    res.json({ ok: true })
  } catch (error) {
    console.log("verifyRecovery error:", error)
    fail(res, 500, "Internal server error")
  }
}
