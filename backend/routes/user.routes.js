import express from "express"
import { authPerIp, loginPerAccount, recoveryLimit } from "../middleware/rateLimit.js"
import { socketToken, listSessions, endSession, endOtherSessions, allUser, usernameAvailable, usernameSuggestions, login, logout, signup, updateProfile, getMe, updateAvatar, removeAvatar, updatePrivacy, getPresence, uploadWallpaper, setWallpaper } from "../controller/user.controller.js"
import { uploadAvatarSingle } from "../config/cloudinary.js"
import secureRoute from "../middleware/secureRoute.js"
import { accountStatus, deleteAccount, downloadExport, requestExport, sendDeleteCode, setEmailDigest } from "../controller/account.controller.js"
import { forgotPassword, resetPassword, setSecurityQuestion, verifyRecovery } from "../controller/security.controller.js"

const router = express.Router()
router.post("/signup", authPerIp, signup)
router.post("/login", authPerIp, loginPerAccount, login)
router.post("/logout", logout)
router.get("/allusers", secureRoute, allUser)
router.get("/username-available/:username", usernameAvailable)
router.get("/username-suggestions", usernameSuggestions)
router.put("/update", secureRoute, updateProfile)
router.get("/me", secureRoute, getMe)
router.get("/socket-token", secureRoute, socketToken)
router.get("/sessions", secureRoute, listSessions)
router.delete("/sessions/:sid", secureRoute, endSession)
router.post("/sessions/sign-out-others", secureRoute, endOtherSessions)
router.put("/privacy", secureRoute, updatePrivacy)
router.get("/presence/:id", secureRoute, getPresence)
router.post("/wallpaper/image", secureRoute, uploadAvatarSingle("image"), uploadWallpaper)
router.put("/wallpaper", secureRoute, setWallpaper)
router.put("/avatar", secureRoute, uploadAvatarSingle("avatar"), updateAvatar)
router.delete("/avatar", secureRoute, removeAvatar)
router.post("/forgot-password", authPerIp, recoveryLimit, forgotPassword)
router.get("/account", secureRoute, accountStatus)
router.post("/export", secureRoute, requestExport)
router.get("/export/download/:token", secureRoute, downloadExport)
router.get("/export/latest", secureRoute, downloadExport)
router.post("/delete-account/code", secureRoute, sendDeleteCode)
router.post("/delete-account", secureRoute, deleteAccount)
router.put("/email-digest", secureRoute, setEmailDigest)
router.post("/reset-password", authPerIp, recoveryLimit, resetPassword)
router.put("/security/question", secureRoute, setSecurityQuestion)
router.post("/security/verify", secureRoute, verifyRecovery)
export default router
