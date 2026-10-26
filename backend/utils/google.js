import crypto from "node:crypto"
import { GoogleAccount } from "../models/googleAccount.model.js"

// Google Calendar (incl. Meet links) and Google Tasks for Nexa, over plain REST.
// Setup: Google Cloud console > APIs & Services: enable "Google Calendar API" and "Google Tasks API",
// create an OAuth client (Web application) with redirect URI GOOGLE_REDIRECT_URI.

export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/tasks",
]

// Optional extra: Gmail (read mail, create drafts; Nexa never sends mail by itself)
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
]
export const hasGmail = (account) => !!account?.scopes?.some((s) => s.includes("gmail.readonly"))

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
export const redirectUri = () => process.env.GOOGLE_REDIRECT_URI || `${(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "")}/api/google/callback`

export class GoogleError extends Error {
  constructor(message, status = 502) { super(message); this.status = status }
}

// ── Refresh tokens are stored encrypted (AES-256-GCM) ─────────
const key = () => crypto.createHash("sha256").update(process.env.GOOGLE_TOKEN_KEY || process.env.token || "nexchat").digest()
export const encrypt = (text) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".")
}
export const decrypt = (packed) => {
  const [iv, tag, data] = packed.split(".").map((p) => Buffer.from(p, "base64"))
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}

// ── OAuth ──────────────────────────────────────────────────────
export const authUrl = (state, { gmail = false } = {}) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: [...SCOPES, ...(gmail ? GMAIL_SCOPES : [])].join(" "),
    access_type: "offline",          // gives a refresh token, so reminders work while the user is away
    prompt: "consent",                // always return a refresh token, even on reconnect
    include_granted_scopes: "true",
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

const tokenRequest = async (body) => {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...body }),
    signal: AbortSignal.timeout(15_000),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

export const exchangeCode = async (code) => {
  const { ok, data } = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() })
  if (!ok || !data.refresh_token) throw new GoogleError(data.error_description || "Google didn't return access")
  const email = data.id_token ? JSON.parse(Buffer.from(data.id_token.split(".")[1], "base64url").toString()).email : ""
  return { refreshToken: data.refresh_token, accessToken: data.access_token, expiresIn: data.expires_in, scopes: String(data.scope || "").split(" "), email }
}

export const revoke = async (account) => {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(account.refreshToken))}`, { method: "POST", signal: AbortSignal.timeout(10_000) })
  } catch { /* already gone */ }
}

// A valid access token for this account (refreshed when about to expire).
// Calls running at the same time share one refresh.
const refreshing = new Map() // account id -> Promise<token>

const accessTokenFor = async (account) => {
  if (account.accessToken && account.accessExpires && account.accessExpires.getTime() - Date.now() > 60_000) return account.accessToken
  const id = String(account._id)
  if (!refreshing.has(id)) {
    refreshing.set(id, (async () => {
      const { ok, data } = await tokenRequest({ refresh_token: decrypt(account.refreshToken), grant_type: "refresh_token" })
      if (!ok) {
        if (data.error === "invalid_grant") {
          await GoogleAccount.updateOne({ _id: account._id }, { broken: true })
          account.broken = true
          throw new GoogleError("Google access was removed. Reconnect Google in Nexa's calendar settings.", 401)
        }
        throw new GoogleError("Couldn't reach Google right now.")
      }
      const accessExpires = new Date(Date.now() + (data.expires_in || 3600) * 1000)
      await GoogleAccount.updateOne({ _id: account._id }, { accessToken: data.access_token, accessExpires, broken: false })
      return { token: data.access_token, accessExpires }
    })().finally(() => refreshing.delete(id)))
  }
  const { token, accessExpires } = await refreshing.get(id)
  account.accessToken = token
  account.accessExpires = accessExpires
  return token
}

const api = async (account, url, { method = "GET", body, query } = {}) => {
  const token = await accessTokenFor(account)
  const full = query ? `${url}?${new URLSearchParams(query)}` : url
  const res = await fetch(full, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 204) return {}
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) account.accessExpires = null // refresh next time
  if (!res.ok) throw new GoogleError(data.error?.message || `Google error ${res.status}`, res.status === 404 ? 404 : 502)
  return data
}

export const getAccount = (userId) => GoogleAccount.findOne({ user: userId, broken: false })

// ── Calendar ───────────────────────────────────────────────────
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

const simplifyEvent = (e) => ({
  id: e.id,
  title: e.summary || "(No title)",
  start: e.start?.dateTime || e.start?.date,
  end: e.end?.dateTime || e.end?.date,
  allDay: !e.start?.dateTime,
  location: e.location || undefined,
  meetLink: e.hangoutLink || e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri || undefined,
  link: e.htmlLink,
  attendees: (e.attendees || []).filter((a) => !a.self).slice(0, 10).map((a) => a.displayName || a.email),
  myResponse: e.attendees?.find((a) => a.self)?.responseStatus,
  createdAt: e.created || undefined, // when it was added to Google Calendar
  isReminder: e.extendedProperties?.private?.nexaReminder === "1" || undefined,
  recurring: !!e.recurringEventId || undefined,
})

export const listEvents = async (account, from, to, max = 25) => {
  const data = await api(account, CAL, {
    query: { timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: String(max) },
  })
  // Leave out events I declined
  return (data.items || []).filter((e) => e.status !== "cancelled").map(simplifyEvent).filter((e) => e.myResponse !== "declined")
}

// recurrence: e.g. ["RRULE:FREQ=DAILY;COUNT=30"]. reminder: a Nexa reminder (Google pops it up on the phone at the time).
export const createEvent = async (account, { title, start, end, description, attendees = [], meet = false, timeZone, recurrence, reminder = false }) => {
  const body = {
    summary: title,
    description,
    start: { dateTime: new Date(start).toISOString(), timeZone },
    end: { dateTime: new Date(end).toISOString(), timeZone },
    attendees: attendees.filter((a) => /\S+@\S+\.\S+/.test(a)).map((email) => ({ email })),
    ...(meet ? { conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
    ...(recurrence?.length ? { recurrence } : {}),
    ...(reminder ? {
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 0 }] },
      extendedProperties: { private: { nexaReminder: "1" } },
      transparency: "transparent", // a reminder doesn't make you "busy"
    } : {}),
  }
  const data = await api(account, CAL, {
    method: "POST",
    body,
    query: { conferenceDataVersion: meet ? "1" : "0", sendUpdates: body.attendees.length ? "all" : "none" },
  })
  return simplifyEvent(data)
}

export const deleteEvent = (account, id) => api(account, `${CAL}/${encodeURIComponent(id)}`, { method: "DELETE", query: { sendUpdates: "all" } })

// ── Tasks (default list) ───────────────────────────────────────
const TASKS = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks"

const simplifyTask = (t) => ({ id: t.id, title: t.title || "(No title)", due: t.due ? t.due.slice(0, 10) : undefined, notes: t.notes || undefined, done: t.status === "completed" })

export const listTasks = async (account, { includeDone = false } = {}) => {
  const data = await api(account, TASKS, { query: { showCompleted: includeDone ? "true" : "false", showHidden: "false", maxResults: "100" } })
  return (data.items || []).filter((t) => t.title?.trim()).map(simplifyTask)
}

export const addTask = async (account, { title, due, notes }) =>
  simplifyTask(await api(account, TASKS, { method: "POST", body: { title, notes, ...(due ? { due: `${due.slice(0, 10)}T00:00:00.000Z` } : {}) } }))

export const completeTask = async (account, id) =>
  simplifyTask(await api(account, `${TASKS}/${encodeURIComponent(id)}`, { method: "PATCH", body: { status: "completed" } }))

// ── Gmail ──────────────────────────────────────────────────────
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
const header = (msg, name) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ""
const b64 = (data) => Buffer.from(String(data || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
const stripHtml = (html) => html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')

// "Priya Sharma <priya@x.com>" -> "Priya Sharma"
const nameOf = (from) => from.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || from

const simplifyMail = (m) => ({
  id: m.id,
  threadId: m.threadId,
  from: nameOf(header(m, "From")),
  fromEmail: (header(m, "From").match(/<([^>]+)>/) || [])[1] || header(m, "From"),
  subject: header(m, "Subject") || "(no subject)",
  date: header(m, "Date") ? new Date(header(m, "Date")).toISOString() : undefined,
  snippet: (m.snippet || "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").slice(0, 200),
  unread: (m.labelIds || []).includes("UNREAD"),
})

// Search mail (Gmail search syntax, e.g. "is:unread category:primary", "from:priya")
export const listMail = async (account, { q = "in:inbox", max = 8 } = {}) => {
  const list = await api(account, `${GMAIL}/messages`, { query: { q, maxResults: String(Math.min(max, 20)) } })
  const ids = (list.messages || []).map((m) => m.id)
  const full = await Promise.all(ids.map((id) => api(account, `${GMAIL}/messages/${id}`, { query: [["format", "metadata"], ["metadataHeaders", "From"], ["metadataHeaders", "Subject"], ["metadataHeaders", "Date"]] }).catch(() => null)))
  return full.filter(Boolean).map(simplifyMail)
}

// One email with its text (trimmed)
export const readMail = async (account, id) => {
  const m = await api(account, `${GMAIL}/messages/${encodeURIComponent(id)}`, { query: { format: "full" } })
  const parts = []
  const walk = (p) => { if (!p) return; if (p.parts) p.parts.forEach(walk); else if (p.body?.data) parts.push({ type: p.mimeType, text: b64(p.body.data) }) }
  walk(m.payload)
  const plain = parts.find((p) => p.type === "text/plain")?.text
  const html = parts.find((p) => p.type === "text/html")?.text
  const body = (plain || (html ? stripHtml(html) : m.snippet || "")).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim()
  return { ...simplifyMail(m), to: header(m, "To"), body: body.slice(0, 6000), messageIdHeader: header(m, "Message-ID"), references: header(m, "References") }
}

const encodeHeader = (v) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=`)
const rfc822 = ({ to, subject, body, inReplyTo, references }) => [
  `To: ${to}`,
  `Subject: ${encodeHeader(subject)}`,
  ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${[references, inReplyTo].filter(Boolean).join(" ")}`] : []),
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=UTF-8",
  "Content-Transfer-Encoding: base64",
  "",
  Buffer.from(body).toString("base64"),
].join("\r\n")
const raw = (mime) => Buffer.from(mime).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

// Save a draft (reply in the same thread, or a new email). The user reviews and sends it from Gmail.
export const createDraft = async (account, { replyToId, to, subject, body }) => {
  let threadId
  let headers = { to, subject }
  if (replyToId) {
    const orig = await readMail(account, replyToId)
    threadId = orig.threadId
    headers = { to: orig.fromEmail, subject: /^re:/i.test(orig.subject) ? orig.subject : `Re: ${orig.subject}`, inReplyTo: orig.messageIdHeader, references: orig.references }
  }
  const draft = await api(account, `${GMAIL}/drafts`, { method: "POST", body: { message: { raw: raw(rfc822({ ...headers, body })), ...(threadId ? { threadId } : {}) } } })
  return { id: draft.id, to: headers.to, subject: headers.subject, link: `https://mail.google.com/mail/u/0/#drafts?compose=${draft.message?.id || ""}` }
}
