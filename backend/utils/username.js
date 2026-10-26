import crypto from "node:crypto"
import User from "../models/user.model.js"

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/
// Names people can't take (the assistant and service names)
export const RESERVED_USERNAMES = new Set(["nexa", "nexa.ai", "nexchat", "kova", "admin", "support", "system"])
export const USERNAME_RULES = "3–20 characters: lowercase letters, numbers, _ or ."

export const normalizeUsername = (value) => String(value || "").trim().replace(/^@/, "").toLowerCase()

// A free username based on some text (e.g. the email), like "arjun" or "arjun2".
export const generateUsername = async (seed) => {
  let base = normalizeUsername(seed).replace(/[^a-z0-9_.]/g, "").slice(0, 16)
  if (base.length < 3) base = (base + "user").slice(0, 16)
  for (let n = 0; n < 1000; n++) {
    const candidate = n ? `${base}${n + 1}` : base
    if (!RESERVED_USERNAMES.has(candidate) && !(await User.exists({ username: candidate }))) return candidate
  }
  return `${base}${crypto.randomInt(1e5, 1e6)}`
}

export const newInviteToken = () => crypto.randomBytes(12).toString("base64url")
