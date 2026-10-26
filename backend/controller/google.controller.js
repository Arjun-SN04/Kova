import crypto from "node:crypto"
import jwt from "jsonwebtoken"
import { GoogleAccount } from "../models/googleAccount.model.js"
import { authUrl, encrypt, exchangeCode, googleConfigured, hasGmail, redirectUri, revoke } from "../utils/google.js"
import { MAX_SNOOZE_MIN, safeZone, sendBrief, snoozeReminder } from "../utils/agenda.js"
import { AiMessage } from "../models/aiMessage.model.js"

// Connecting Google Calendar + Tasks for Nexa.
// The login cookie is SameSite=strict, so it isn't sent when Google redirects back.
// The callback trusts a signed `state` plus a matching short-lived cookie (SameSite=lax),
// so nobody can link their Google account to someone else's Kova account.

const NONCE_COOKIE = "g_oauth"
// Back to the same site the callback came through (so local dev and production each work)
const frontend = () => new URL(redirectUri()).origin

const settingsOf = (a) => a && ({
  email: a.email,
  broken: a.broken,
  timeZone: a.timeZone,
  dailyBrief: a.dailyBrief,
  briefTime: a.briefTime,
  meetReminders: a.meetReminders,
  reminderMinutes: a.reminderMinutes,
  gmail: hasGmail(a),
  briefEmails: a.briefEmails,
})

export const googleStatus = async (req, res) => {
  try {
    const account = await GoogleAccount.findOne({ user: req.user._id })
    // Keep the time zone current, so the brief arrives in the morning wherever they are
    if (account && req.query.tz && safeZone(req.query.tz) === req.query.tz && account.timeZone !== req.query.tz) {
      account.timeZone = req.query.tz
      await account.save()
    }
    res.json({ configured: googleConfigured(), connected: !!account, account: settingsOf(account) })
  } catch (error) {
    console.log("googleStatus error:", error.message)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const googleConnect = (req, res) => {
  if (!googleConfigured()) return res.status(503).json({ error: "Google isn't set up on this server yet." })
  const nonce = crypto.randomBytes(16).toString("hex")
  const tz = safeZone(String(req.query.tz || "UTC"))
  const state = jwt.sign({ u: String(req.user._id), n: nonce, tz }, process.env.token, { expiresIn: "10m" })
  res.cookie(NONCE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/" })
  res.json({ url: authUrl(state, { gmail: req.query.gmail === "1" }) })
}

export const googleCallback = async (req, res) => {
  const back = (result) => {
    res.clearCookie(NONCE_COOKIE, { path: "/" })
    res.redirect(`${frontend()}/?google=${result}`)
  }
  try {
    if (req.query.error) return back("cancelled")
    let state
    try { state = jwt.verify(String(req.query.state || ""), process.env.token) } catch { return back("expired") }
    if (!state.n || state.n !== req.cookies?.[NONCE_COOKIE]) return back("expired")

    const tokens = await exchangeCode(String(req.query.code || ""))
    const needed = ["calendar.events", "auth/tasks"]
    if (!needed.every((s) => tokens.scopes.some((g) => g.includes(s)))) return back("missing")

    await GoogleAccount.findOneAndUpdate(
      { user: state.u },
      {
        $set: {
          email: tokens.email,
          refreshToken: encrypt(tokens.refreshToken),
          accessToken: tokens.accessToken,
          accessExpires: new Date(Date.now() + (tokens.expiresIn || 3600) * 1000),
          scopes: tokens.scopes,
          broken: false,
        },
        $setOnInsert: { timeZone: state.tz || "UTC" },
      },
      { upsert: true, new: true },
    )
    back("connected")
  } catch (error) {
    console.log("googleCallback error:", error.message)
    back("failed")
  }
}

export const googleSettings = async (req, res) => {
  try {
    const account = await GoogleAccount.findOne({ user: req.user._id })
    if (!account) return res.status(404).json({ error: "Google isn't connected" })
    const { dailyBrief, briefTime, meetReminders, reminderMinutes } = req.body
    if (typeof dailyBrief === "boolean") account.dailyBrief = dailyBrief
    if (typeof meetReminders === "boolean") account.meetReminders = meetReminders
    if (typeof req.body.briefEmails === "boolean") account.briefEmails = req.body.briefEmails
    if (typeof briefTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(briefTime)) {
      // A new time today: allow today's brief again if that time is still ahead
      if (briefTime !== account.briefTime) account.lastBriefDate = ""
      account.briefTime = briefTime
    }
    if ([5, 10, 15, 30, 60].includes(Number(reminderMinutes))) account.reminderMinutes = Number(reminderMinutes)
    await account.save()
    res.json({ account: settingsOf(account) })
  } catch (error) {
    console.log("googleSettings error:", error.message)
    res.status(500).json({ error: "Internal server error" })
  }
}

// "Send me today's brief now"
export const googleBriefNow = async (req, res) => {
  try {
    const account = await GoogleAccount.findOne({ user: req.user._id, broken: false })
    if (!account) return res.status(404).json({ error: "Google isn't connected" })
    const message = await sendBrief(account)
    res.json({ message })
  } catch (error) {
    console.log("googleBriefNow error:", error.message)
    res.status(error.status || 500).json({ error: error.status ? error.message : "Couldn't get your calendar" })
  }
}

// Snooze button on a reminder card: { messageId, minutes }
export const googleSnooze = async (req, res) => {
  try {
    const minutes = Number(req.body.minutes)
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_SNOOZE_MIN) return res.status(400).json({ error: "Choose between 1 minute and 24 hours" })
    const account = await GoogleAccount.findOne({ user: req.user._id })
    const message = await AiMessage.findOne({ _id: req.params.messageId, user: req.user._id, role: "assistant" })
    if (!account || !message) return res.status(404).json({ error: "Reminder not found" })
    const action = await snoozeReminder(account, message, new Date(Date.now() + Math.round(minutes) * 60_000))
    res.json({ action })
  } catch (error) {
    if (!error.status) console.log("googleSnooze error:", error.message)
    res.status(error.status || 500).json({ error: error.status ? error.message : "Couldn't snooze it" })
  }
}

export const googleDisconnect = async (req, res) => {
  try {
    const account = await GoogleAccount.findOne({ user: req.user._id })
    if (account) {
      await revoke(account)
      await account.deleteOne()
    }
    res.json({ connected: false })
  } catch (error) {
    console.log("googleDisconnect error:", error.message)
    res.status(500).json({ error: "Internal server error" })
  }
}
