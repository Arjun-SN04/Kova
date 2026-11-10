import { rateLimit, ipKeyGenerator } from "express-rate-limit"

// Limits for endpoints people could abuse: guessing passwords, flooding email codes,
// or burning the AI quota. Counts are kept in memory (one server process).

const tooMany = (message) => ({
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: message },
})

const emailOf = (req) => String(req.body?.email || "").trim().toLowerCase()

// Password guesses for one account, from anywhere (so changing IP doesn't help)
export const loginPerAccount = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  keyGenerator: (req) => `login:${emailOf(req) || ipKeyGenerator(req.ip)}`,
  skipSuccessfulRequests: true,
  ...tooMany("Too many sign-in attempts. Try again in 15 minutes."),
})

// Sign-in / sign-up attempts from one address
export const authPerIp = rateLimit({
  windowMs: 15 * 60_000,
  limit: 50,
  ...tooMany("Too many attempts from your network. Try again later."),
})

// Email codes and password resets
export const recoveryLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  keyGenerator: (req) => `recovery:${emailOf(req) || ipKeyGenerator(req.ip)}`,
  ...tooMany("Too many tries. Wait 15 minutes and try again."),
})

// A backstop for the AI endpoints (each also has its own per-user limits)
export const aiLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  keyGenerator: (req) => (req.user?._id ? `ai:${req.user._id}` : ipKeyGenerator(req.ip)),
  ...tooMany("You're going a bit fast. Wait a moment and try again."),
})
