import fs from "node:fs"
import bcrypt from "bcryptjs"
import User from "../models/user.model.js"
import { buildExport, exportFile, scheduleDeletion } from "../utils/accountData.js"
import { issueCode, useCode } from "../utils/securityCode.js"

const fail = (res, status, error) => res.status(status).json({ error })

// Profile → Your data & account
export const accountStatus = async (req, res) => {
  const me = await User.findById(req.user._id).select("dataExport emailDigest")
  const e = me.dataExport || {}
  res.json({
    dataExport: e.status ? { status: e.status, size: e.size, requestedAt: e.requestedAt, readyAt: e.readyAt, expiresAt: e.expiresAt } : null,
    emailDigest: { enabled: !!me.emailDigest?.enabled },
  })
}

// Start building my data export (emailed when ready). Once an hour at most.
export const requestExport = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("dataExport")
    const e = me.dataExport || {}
    const recent = e.requestedAt && Date.now() - e.requestedAt.getTime() < 3600_000
    if (e.status === "building" && recent) return fail(res, 409, "Your export is already being prepared. We’ll email you when it’s ready.")
    if (recent && e.status === "ready") return fail(res, 429, "You asked for an export less than an hour ago. Use the download link from that one.")
    if (e.token) fs.rm(exportFile(e.token), { force: true }, () => {})
    await User.updateOne({ _id: me._id }, { $set: { dataExport: { status: "building", requestedAt: new Date() } } })
    buildExport(me._id) // in the background
    res.json({ status: "building" })
  } catch (error) {
    console.log("requestExport error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Download the ZIP (signed-in owner only, until it expires). From the email (with its token)
// or from Profile ("latest").
export const downloadExport = async (req, res) => {
  const me = await User.findById(req.user._id).select("dataExport fullName")
  const e = me.dataExport || {}
  const tokenOk = req.params.token ? e.token === req.params.token : true
  if (!e.token || !tokenOk || e.status !== "ready" || e.expiresAt < new Date()) return fail(res, 404, "This download link has expired. Ask for a new export in Profile.")
  const file = exportFile(e.token)
  if (!fs.existsSync(file)) return fail(res, 404, "This export is no longer available. Ask for a new one in Profile.")
  res.download(file, `kova-data-${new Date(e.readyAt).toISOString().slice(0, 10)}.zip`)
}

// Email a 6-digit code to confirm deleting the account (instead of the password)
export const sendDeleteCode = async (req, res) => {
  try {
    const r = await issueCode({ userId: req.user._id }, "delete")
    if (!r.ok) return fail(res, r.status, r.error)
    res.json({ sentTo: r.sentTo })
  } catch (error) {
    console.log("sendDeleteCode error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Schedule my account for deletion in 30 days (password or emailed code), and sign out
export const deleteAccount = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("fullName email password securityCode")
    if (req.body.otp) {
      const check = await useCode(me, "delete", req.body.otp)
      if (!check.ok) return fail(res, 400, check.error)
      await me.save()
    } else if (!req.body.password || !(await bcrypt.compare(String(req.body.password), me.password))) {
      return fail(res, 400, "Your password isn't right")
    }
    const scheduledFor = await scheduleDeletion(me)
    res.clearCookie("jwt")
    res.json({ scheduledFor })
  } catch (error) {
    console.log("deleteAccount error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const setEmailDigest = async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $set: { "emailDigest.enabled": !!req.body.enabled } })
  res.json({ emailDigest: { enabled: !!req.body.enabled } })
}
