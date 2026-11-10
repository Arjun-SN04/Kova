import crypto from "node:crypto"
import jwt from "jsonwebtoken"
import User from "../models/user.model.js"
import { Session } from "../models/session.model.js"

// How long a login lasts. The cookie is renewed while the user keeps using the app
// (see secureRoute), so active users never get logged out.
export const SESSION_DAYS = 30
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000

// Sets the login cookie for an existing session (renewing it keeps the same session)
const Createtoken = (user_id, res, sid) => {
    const token = jwt.sign({ user_id, ...(sid ? { sid } : {}) }, process.env.token, { expiresIn: `${SESSION_DAYS}d` })
    res.cookie("jwt", token, {
        httpOnly: true,
        // HTTPS-only in production; local development runs on plain http
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        // Without maxAge the cookie is deleted when the browser closes,
        // while the saved user in localStorage stays and the app looks logged in.
        maxAge: SESSION_MS,
    })
}
export default Createtoken

// "Chrome on Windows", "Safari on iPhone"… from the browser's User-Agent
export const deviceName = (ua = "") => {
    const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
        : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : ""
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
        : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : ""
    return browser && os ? `${browser} on ${os}` : browser || os || "Unknown device"
}

// A new signed-in device: record it and set its login cookie
export const startSession = async (userId, req, res) => {
    const sid = crypto.randomBytes(16).toString("hex")
    await Session.create({
        user: userId,
        sid,
        device: deviceName(String(req.headers["user-agent"] || "")),
        ip: req.ip || "",
        expiresAt: new Date(Date.now() + SESSION_MS),
    })
    Createtoken(userId, res, sid)
    return sid
}

// A login cookie from before devices were tracked: give it a session. The session id comes
// from the cookie itself, so several requests arriving at once all land on the same one.
export const adoptOldLogin = async (userId, token, req, res) => {
    const sid = crypto.createHash("sha256").update(token).digest("hex").slice(0, 32)
    await Session.updateOne(
        { sid },
        { $setOnInsert: { user: userId, sid, device: deviceName(String(req.headers["user-agent"] || "")), ip: req.ip || "", lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_MS) } },
        { upsert: true },
    ).catch((err) => { if (err.code !== 11000) throw err })
    Createtoken(userId, res, sid)
    return sid
}

// The signed-in user for a login cookie, or null: { user, decoded, session }
// Refused: tokens made before the password last changed, before "Sign out other devices"
// (older tokens without a session), and sessions that were signed out.
export const userFromSession = async (token) => {
    if (!token) return null
    const decoded = jwt.verify(token, process.env.token)
    // Socket tokens only open the realtime connection, never the API
    if (!decoded?.user_id || decoded.kind) return null
    const user = await User.findById(decoded.user_id).select("-password")
    if (!user) return null
    const changed = user.passwordChangedAt?.getTime()
    if (changed && decoded.iat < Math.floor(changed / 1000)) return null
    let session = null
    if (decoded.sid) {
        session = await Session.findOne({ sid: decoded.sid, user: user._id })
        if (!session) return null
    } else {
        const reset = user.sessionsResetAt?.getTime()
        // <=: no new logins without a session are made, so one from that same second is old too
        if (reset && decoded.iat <= Math.floor(reset / 1000)) return null
    }
    return { user, decoded, session }
}

// Sign out sessions (all of a user's, or all but one)
export const endSessions = (userId, { except = null } = {}) =>
    Session.deleteMany({ user: userId, ...(except ? { sid: { $ne: except } } : {}) })
