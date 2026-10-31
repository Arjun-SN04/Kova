import jwt from "jsonwebtoken"
import User from "../models/user.model.js"
import { runAsViewer } from "../utils/viewer.js"

// Like secureRoute, but lets signed-out visitors through (req.user stays null).
// Used by public pages such as a business's shop page.
const optionalAuth = async (req, res, next) => {
  req.user = null
  try {
    const token = req.cookies.jwt
    if (token) {
      const decoded = jwt.verify(token, process.env.token)
      req.user = await User.findById(decoded.user_id).select("-password")
    }
  } catch {
    req.user = null
  }
  runAsViewer(req.user, next)
}

export default optionalAuth
