import Createtoken, { SESSION_DAYS, adoptOldLogin, userFromSession } from "../jwt/token.js"
import { runAsViewer } from "../utils/viewer.js"

// Renew the login cookie at most once a day, so active users stay logged in.
const RENEW_AFTER_SECONDS = 24 * 60 * 60
// "Last active" on the Devices list is updated at most this often
const SEEN_EVERY_MS = 5 * 60 * 1000

const secureRoute = async (req, res, next) => {
  try {
    const token = req.cookies.jwt
    if (!token) {
      return res.status(401).json({ error: "No token unauthorzed access" })
    }
    const session = await userFromSession(token)
    if (!session) {
      res.clearCookie("jwt")
      return res.status(401).json({ error: "Your session has ended. Please sign in again." })
    }
    const { user, decoded, session: device } = session
    // Scheduled for deletion: signed out everywhere until they sign in again (which cancels it)
    if (user.deletion?.scheduledFor) {
      res.clearCookie("jwt")
      return res.status(401).json({ error: "This account is scheduled for deletion. Sign in to keep it.", code: "deleting" })
    }
    if (!device) {
      // A login from before devices were tracked: give it a session (shows in Devices)
      req.sid = await adoptOldLogin(user._id, token, req, res)
    } else {
      req.sid = device.sid
      const now = Date.now()
      if (now / 1000 - decoded.iat > RENEW_AFTER_SECONDS) {
        Createtoken(user._id, res, device.sid)
        device.expiresAt = new Date(now + SESSION_DAYS * 24 * 3600_000)
      }
      if (now - device.lastSeenAt.getTime() > SEEN_EVERY_MS || device.isModified()) {
        device.lastSeenAt = new Date(now)
        device.save().catch(() => {})
      }
    }
    req.user = user
  } catch (error) {
    console.log("secureRoute:", error.message)
    return res.status(401).json({ error: "Invalid or expired token" })
  }
  runAsViewer(req.user, next)
}

export default secureRoute
