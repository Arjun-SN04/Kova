import jwt from "jsonwebtoken"
import User from "../models/user.model.js"
import Createtoken from "../jwt/token.js"
import { runAsViewer } from "../utils/viewer.js"

// Renew the login cookie at most once a day, so active users stay logged in.
const RENEW_AFTER_SECONDS = 24 * 60 * 60

const secureRoute = async (req, res, next) => {
  try {
    const token = req.cookies.jwt
    if (!token) {
      return res.status(401).json({ error: "No token unauthorzed access" })
    }
    const decoded = jwt.verify(token, process.env.token)
    if (!decoded) {
      return res.status(401).json({ error: "token not decoded" })
    }
    const user = await User.findById(decoded.user_id).select("-password")
    if (!user) {
      return res.status(401).json({ error: "user not found" })
    }
    if (Date.now() / 1000 - decoded.iat > RENEW_AFTER_SECONDS) {
      Createtoken(user._id, res)
    }
    req.user = user
  } catch (error) {
    console.log("secureRoute:", error.message)
    return res.status(401).json({ error: "Invalid or expired token" })
  }
  runAsViewer(req.user, next)
}

export default secureRoute
