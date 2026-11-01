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

// Latin letters of a name, accents removed: "José Núñez" → ["jose", "nunez"]
const nameParts = (name) => String(name || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9\s]/g, " ")
  .split(/\s+/).filter(Boolean).slice(0, 4)

const fit = (u) => u.replace(/^[._]+|[._]+$/g, "").slice(0, 20).replace(/[._]+$/g, "")

// Free usernames based on a person's name (and email, as a fallback), best first.
// "Jane Cooper" → janecooper, jane.cooper, jane_cooper, jcooper, janec, cooperjane, jane, janecooper27…
export const suggestUsernames = async (name, email = "", count = 5) => {
  let parts = nameParts(name)
  if (!parts.length) parts = nameParts(String(email).split("@")[0].replace(/[._-]+/g, " "))
  if (!parts.length) parts = ["kova", "user"]
  const [first, ...rest] = parts
  const last = rest[rest.length - 1] || ""
  const joined = parts.join("")

  const base = [
    joined,
    last && `${first}.${last}`,
    last && `${first}_${last}`,
    last && `${first[0]}${last}`,
    last && `${first}${last[0]}`,
    last && `${last}${first}`,
    last && `${last}.${first}`,
    first,
    `the${first}`,
    `${first}.official`,
  ]
  // Numbered versions as a fallback: short years and random numbers
  const roots = [joined, last ? `${first}.${last}` : first, first]
  const numbered = []
  for (const r of roots) for (let i = 0; i < 4; i++) numbered.push(`${r}${crypto.randomInt(i < 2 ? 10 : 100, i < 2 ? 100 : 1000)}`)

  const seen = new Set()
  const candidates = [...base, ...numbered]
    .filter(Boolean).map(fit)
    .filter((u) => USERNAME_RE.test(u) && !RESERVED_USERNAMES.has(u) && !seen.has(u) && seen.add(u))

  const taken = new Set((await User.find({ username: { $in: candidates } }).select("username").lean()).map((u) => u.username))
  const free = candidates.filter((u) => !taken.has(u))
  // Keep a numbered one in the mix even when the plain ones are free
  const plain = free.filter((u) => !/\d$/.test(u)).slice(0, count - 1)
  const withNumber = free.filter((u) => /\d$/.test(u) && !plain.includes(u))
  return [...plain, ...withNumber].slice(0, count)
}
