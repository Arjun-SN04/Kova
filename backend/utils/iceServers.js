import crypto from "node:crypto"

// Servers that help two browsers connect for a call.
// - STUN (free, always): finds each side's public address. Enough for most networks.
// - TURN (optional): relays the call when a direct path is impossible (strict office Wi-Fi,
//   some mobile networks). Without it those calls never connect. Two ways to add one:
//     1. Cloudflare Calls TURN (free tier): CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
//     2. Your own coturn with `use-auth-secret`: TURN_URLS (comma-separated) + TURN_SECRET
// Credentials are short-lived and made here, so the secret never reaches the browser.

const STUN = { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
const TTL_SECONDS = 12 * 3600
let cloudflare = { at: 0, servers: null }

const fromCloudflare = async () => {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN
  if (!keyId || !token) return null
  // Reuse for a few hours (the credentials last 12)
  if (cloudflare.servers && Date.now() - cloudflare.at < 4 * 3600_000) return cloudflare.servers
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: TTL_SECONDS }),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Cloudflare TURN ${res.status}`)
  const data = await res.json()
  const servers = [].concat(data.iceServers || []).filter((s) => s?.urls)
  cloudflare = { at: Date.now(), servers }
  return servers
}

// coturn "TURN REST API": username = expiry:user, password = HMAC-SHA1(secret, username)
const fromCoturn = (userId) => {
  const urls = String(process.env.TURN_URLS || "").split(",").map((u) => u.trim()).filter(Boolean)
  const secret = process.env.TURN_SECRET
  if (!urls.length || !secret) return null
  const username = `${Math.floor(Date.now() / 1000) + TTL_SECONDS}:${userId}`
  const credential = crypto.createHmac("sha1", secret).update(username).digest("base64")
  return [{ urls, username, credential }]
}

export const iceServersFor = async (userId) => {
  let turn = null
  try { turn = await fromCloudflare() } catch (err) { console.log("TURN:", err.message) }
  turn ||= fromCoturn(userId)
  return { iceServers: [STUN, ...(turn || [])], relay: !!turn?.length }
}
