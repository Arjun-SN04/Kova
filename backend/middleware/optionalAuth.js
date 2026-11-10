import { userFromSession } from "../jwt/token.js"
import { runAsViewer } from "../utils/viewer.js"

// Like secureRoute, but lets signed-out visitors through (req.user stays null).
// Used by public pages such as a business's shop page.
const optionalAuth = async (req, res, next) => {
  req.user = null
  try {
    req.user = (await userFromSession(req.cookies.jwt))?.user || null
  } catch {
    req.user = null
  }
  runAsViewer(req.user, next)
}

export default optionalAuth
