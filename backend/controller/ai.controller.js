import { AiMessage } from "../models/aiMessage.model.js"
import { GoogleAccount } from "../models/googleAccount.model.js"
import { ScheduledMessage } from "../models/scheduledMessage.model.js"
import { askGroq, groqChat } from "../utils/groq.js"
import { CALENDAR_TOOLS, GMAIL_TOOLS, NEXA_TOOLS, describeContext, formatWhen, loadNexaContext, runNexaTool } from "../utils/nexaTools.js"
import { emitToUsers } from "../utils/notify.js"
import { deleteFromCloudinary, uploadToCloudinary } from "../config/cloudinary.js"
import { hasGmail } from "../utils/google.js"
import { TIMER_CHOICES, nexaFiles } from "../utils/disappear.js"
import { parseMedia } from "./gif.controller.js"
import { generateImage } from "../utils/imageGen.js"
import { VISION_MODEL, excerptFor, extractDocText, imageForModel, isDoc, isImage } from "../utils/aiFiles.js"
import { Message } from "../models/message.model.js"
import User from "../models/user.model.js"
import { Group } from "../models/group.model.js"
import { groqTranscribe } from "../utils/groq.js"
import { canSeeMessage, messageText, readChat } from "../utils/chatAccess.js"
import { getNexaBot } from "../utils/nexaBot.js"
import { notifyAudience } from "./message.controller.js"

const MAX_INPUT = 4000        // characters per question
const HISTORY = 6             // earlier messages sent as context (kept short: Groq free tier is ~8k tokens per request)
const LIMIT_PER_MINUTE = 12   // per user, to protect the free API quota

// What Nexa knows about the app, so it can help people use it
const MAX_TOOL_ROUNDS = 5

// The browser sends its time zone; fall back to UTC if it's missing or invalid
const safeTimeZone = (tz) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz } catch { return "UTC" }
}
const offsetOf = (timeZone) =>
  new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value || "GMT"

// "Sat Oct 24 = 2026-10-24, Sun Oct 25 = …": the model often gets weekday names wrong without this
const nextDays = (timeZone) => Array.from({ length: 8 }, (_, i) => {
  const d = new Date(Date.now() + i * 86_400_000)
  const label = d.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" })
  const iso = d.toLocaleDateString("en-CA", { timeZone })
  return `${i === 0 ? "today " : i === 1 ? "tomorrow " : ""}${label} = ${iso}`
}).join(", ")

// ── Nexa's instructions, built per question ────────────────────
// Only the sections (and tools) a question needs are sent, to keep each request small.
const has = (re, ...texts) => texts.some((t) => re.test(t || ""))
const INTENT = {
  app: /\b(kova|nexchat|this app|the app|how (do|can|to)|where (is|do|can)|button|settings?|profile|theme|dark mode|contacts?|communit|groups?|calls?|pin|star|poll|search|disappear|status|story|qr|invite|username|password|block|delete|forward|react|voice note)\b/i,
  people: /\b(send|tell|text|message|msg|ask|reply|remind|schedule|poll|group|chat|catch ?up|summari[sz]e|what did|wish|invite|share|forward|let .* know)\b/i,
  calendar: /\b(calendar|meeting|meet|event|appointment|agenda|schedule|busy|free|today|tomorrow|tonight|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|remind|reminder|snooze|task|to-?do|deadline|due|cancel|delete|move|reschedule)\b/i,
  mail: /\b(e-?mails?|mails?|inbox|gmail|unread|draft|reply to|replies)\b/i,
  image: /\b(draw|paint|sketch|images?|pictures?|pics?|photos?|logo|wallpaper|illustration|poster|artwork)\b/i,
  visual: /\b(table|chart|diagram|flow ?chart|graph|compare|comparison|vs\.?|versus|steps|process|timeline|pros|cons|plan)\b/i,
  code: /\b(code|function|script|program|bug|error|api|class|component|html|css|javascript|typescript|python|java|c\+\+|c#|sql|regex|react|node|unity|json)\b/i,
}
export const intentsFor = (text, prev, ctx) => {
  const first = new Set([...ctx.people.values()].map((c) => c.fullName.split(" ")[0].toLowerCase()).filter((n) => n.length > 2))
  const names = [...ctx.groups.values()].map((g) => g.name.toLowerCase())
  const lower = `${text} ${prev}`.toLowerCase()
  const mentionsSomeone = lower.split(/[^a-zऀ-ॿ]+/).some((w) => first.has(w)) || names.some((n) => n.length > 2 && lower.includes(n))
  return {
    app: has(INTENT.app, text),
    people: mentionsSomeone || has(INTENT.people, text, prev),
    calendar: !!ctx.google && has(INTENT.calendar, text, prev),
    mail: hasGmail(ctx.google) && has(INTENT.mail, text, prev),
    mailAsked: has(INTENT.mail, text),
    image: has(INTENT.image, text),
    visual: has(INTENT.visual, text),
    code: has(INTENT.code, text, prev),
  }
}

const APP_FACTS = `Kova facts (only describe these; if something isn't listed, say Kova doesn't have it yet):
- Contacts are private: person-plus button in Chats > search an exact @username, or share "My QR" / invite link. Requests are in the Requests tab.
- "Message yourself" is at the top of the chat list. Nexa (you) is under it.
- Messages: reply, react (hover), edit within 10 min, delete, forward, select, photos/videos/files up to 10 MB, camera, voice notes up to 2 min, emoji, polls (chart button), Star and Pin (in a message's ⋯ menu), search inside a chat (magnifier in the header), pin a chat (pin button in the header).
- Disappearing messages: set per chat in the chat's info panel (off, 24 hours, 7 days, 90 days); "Keep" in a message's menu saves it. Nexa's chat disappears after 24 hours by default (change it at the top of the Nexa chat).
- Calls: phone/video buttons in a chat header (contacts only); history in the Calls tab. Group voice/video calls (up to 8 people) from a group's header; others get a ring and can Join.
- Status: 24-hour text/photo/video updates for contacts (Status tab in the left rail; seen-by list on your own).
- Notifications: Profile > "Notifications on this device" (push, even when Kova is closed; on iPhone add Kova to the Home Screen first).
- Nexa reads photos and documents (📎 in the Nexa chat: PDFs, Word, text).
- Groups: pen icon > New group. Admins rename, change the group photo, add/remove people, make admins.
- Communities: pen icon > New community. It has an Announcements group (only admins post). Admins add people from their contacts; members press Join on its groups.
- Left rail: Chats, Status, Calls, Communities, Starred. Profile (gear): name, @username, photo, password. Light/dark toggle in the left rail.`

export const systemPrompt = (user, ctx, intents) => [
  `You are Nexa, the friendly AI assistant in Kova (a messenger), chatting with ${user.fullName} (@${user.username}).
Now: ${formatWhen(new Date(), ctx.timeZone)} (${ctx.timeZone}, ${offsetOf(ctx.timeZone)}). Give times as ISO 8601 with this offset. Coming days: ${nextDays(ctx.timeZone)}.`,
  intents.app ? APP_FACTS : "",
  `Tools: send_message and schedule_message (to a contact, group, or "me"; "me" = a reminder Nexa pops up here). schedule_message can repeat (repeat_every_minutes: 2, 60, 1440 for daily; optional repeat_until / repeat_times); never say you can't repeat. list_scheduled_messages / cancel_scheduled_message to view or stop them.${intents.people ? " get_recent_messages to read a chat (summaries, catch up). create_poll for polls." : ""}
browser_search: use it for anything current (news, prices, weather, sports, recent facts); never invent news or numbers; don't paste links (sources show under your answer).`,
  intents.image ? `generate_image: you CAN create images (ignore any earlier reply saying otherwise). Write a vivid English prompt, then reply in one short line.` : "",
  ctx.google
    ? (intents.calendar ? `Google Calendar + Tasks are connected (${ctx.google.email}): get_calendar_events, create_calendar_event (add_meet: true = Google Meet link; is_reminder: true + repeat daily/weekdays/weekly/monthly for reminders), delete_calendar_event, get_tasks, add_task, complete_task, snooze_reminder.
Reminders ("remind me to call mom at 6", "every day at 9") go on the calendar as is_reminder events. Google can't repeat more often than daily, so "every N minutes/hours" uses schedule_message to "me". To invite contacts to a Meet, create it with a link, then offer to send them the link. Don't invent emails.` : "")
    : `Google Calendar isn't connected: if asked about calendar, meetings or tasks, tell them to tap the calendar button at the top of the Nexa chat.`,
  intents.mail ? `Gmail is connected: search_emails (Gmail search syntax), read_email, draft_email. You only SAVE DRAFTS ("saved as a draft in Gmail"); never claim you sent an email.`
    : intents.mailAsked ? `Gmail isn't connected: if asked about email, tell them to open the calendar button at the top of the Nexa chat and tap Connect Gmail.` : "",
  intents.people ? describeContext(ctx) : `(Contacts and groups aren't listed for this question. If the user wants to message someone, ask who.)`,
  `Rules: only send or schedule when clearly asked; if the person, group or time is unclear, ask one short question. Send the user's own words unless they ask for rewording. After acting, confirm in one short sentence. Never claim something worked unless the tool said ok.
Style: friendly and brief. By default 2 to 5 short "- " bullets (one line each). Text to send goes in a quote ("> ..."). No headings, intro lines or sign-offs. **Bold** only for button names. At most one emoji. Never use em or en dashes.`,
  intents.visual ? `When it helps, use a Markdown table (2 to 5 columns) or a Mermaid diagram in a \`\`\`mermaid block ("flowchart TD", node ids A, B, C with labels in double quotes, under 12 nodes, no styling), then at most 2 bullets. Never use HTML tags like <br>; in a table cell separate items with "; ".` : "",
  intents.code ? `Code: complete and working. Each file in its own fenced block with language and file name, e.g. \`\`\`js server.js. Keep the explanation to a few bullets.` : "",
].filter(Boolean).join("\n\n")

const recent = {} // userId -> timestamps of recent questions

// Groq's free tier allows ~8,000 tokens per request (prompt + reply room), so earlier
// messages are sent within a budget: newest first, long ones (code) shortened.
const HISTORY_CHARS = 4000      // ~1,100 tokens of earlier chat
const HISTORY_MSG_CHARS = 800   // per earlier message
const shorten = (text) => (text.length > HISTORY_MSG_CHARS ? `${text.slice(0, HISTORY_MSG_CHARS)}\n…(shortened)` : text)
// How a sent photo, document, GIF or sticker is described to the model
const attachmentNote = (a) =>
  a.kind === "image" ? "sent a photo"
    : a.kind === "gif" ? `sent a GIF${a.name ? `: "${a.name}"` : ""}`
      : a.kind === "sticker" ? `sent a sticker${a.name ? `: ${a.name}` : ""}`
        : `sent a document: ${a.name}`
const historyFor = (messages, budget = HISTORY_CHARS) => {
  const out = []
  let used = 0
  for (const m of [...messages].reverse()) {
    const note = m.attachment ? ` [${attachmentNote(m.attachment)}]` : ""
    const content = shorten((m.content || "(done)") + note)
    if (used + content.length > budget) break
    used += content.length
    out.unshift({ role: m.role, content })
  }
  // Start on a user turn
  while (out[0]?.role === "assistant") out.shift()
  return out
}

// "draw a cat", "create an iamge of…", "make me a wallpaper": these must call generate_image
const IMAGE_NOUN = "(?:image|imag|iamge|imgae|imge|img|picture|pic|photo|drawing|painting|illustration|wallpaper|logo|artwork|poster|sketch|portrait|icon|avatar)s?"
const IMAGE_RE = new RegExp(`\\b(?:draw|paint|sketch|generate|create|make|design|render|produce|give me|show me)\\b.{0,40}\\b${IMAGE_NOUN}\\b|^\\s*(?:please\\s+|can you\\s+|could you\\s+)?(?:draw|paint|sketch)\\b|\\b${IMAGE_NOUN}\\s+of\\b`, "i")
const NOT_IMAGE_RE = /\b(how (do|can|to)|where|profile (pic|picture|photo)|send (a |the )?(photo|pic|picture|image)|attach)/i
const wantsImage = (text) => text.length < 600 && IMAGE_RE.test(text) && !NOT_IMAGE_RE.test(text)
const FORCE_IMAGE = { type: "function", function: { name: "generate_image" } }

// Nexa's tools (calendar ones only when Google is connected) plus Groq's built-in web search
const CORE_TOOLS = ["send_message", "schedule_message", "list_scheduled_messages", "cancel_scheduled_message"]
export const toolsFor = (ctx, intents, forceImage = false) => [
  ...NEXA_TOOLS.filter((t) => CORE_TOOLS.includes(t.function.name)
    || (intents.people && ["get_recent_messages", "create_poll"].includes(t.function.name))
    || ((intents.image || forceImage) && t.function.name === "generate_image")),
  ...(intents.calendar ? CALENDAR_TOOLS : []),
  ...(intents.mail ? GMAIL_TOOLS : []),
  { type: "browser_search" },
]

// Links from Groq's web search, pages Nexa actually opened first
const sourcesOf = (executed = []) => {
  const searches = executed.filter((t) => t.type === "browser_search")
  const opened = new Set(searches.filter((t) => !/"query"/.test(t.arguments || "")).flatMap((t) => (t.search_results?.results || []).map((r) => r.url)))
  const found = searches.filter((t) => /"query"/.test(t.arguments || "")).flatMap((t) => t.search_results?.results || [])
  return found
    .filter((r) => /^https?:\/\//.test(r.url || "") && r.title)
    .sort((a, b) => opened.has(b.url) - opened.has(a.url))
    .map((r) => ({ title: String(r.title).slice(0, 120), url: r.url }))
}

const CAPABILITY_RE = /\b(what (can|could|do) you (do|help)|what are you (capable|able)|your (capabilities|features|skills)|how can you help|what do you offer|what can nexa)\b|^(help|capabilities|features)\??$/i
const CAPABILITIES_TEXT = `Here's what I can do:
- **Send messages** for you, now or later
- **Reminders**, like "remind me at 6pm to call mom"
- **Scheduled messages**: list or cancel them
- **Catch you up** on any chat or group
- **Write and rewrite**: drafts, polish, translate
- **Create images**, like "draw a cozy cabin in the snow"
- **Search the web** for news, prices, scores and anything current
- **Read photos and documents**: send a screenshot, receipt, PDF or Word file (📎) and ask about it
- **Polls**: "make a poll in Team: lunch at 1 or 2?"
- **Google Calendar, Tasks & Gmail**: meetings, Meet links, tasks, unread mail, reply drafts and a morning brief (connect with the 📅 button above)
- **Kova help**: contacts, groups, calls, communities
- In any chat: ✨ rewrite, smart replies, Catch me up, Translate, Transcribe, Remind me, and **@Nexa** in groups`

export const getAiMessages = async (req, res) => {
  try {
    const messages = await AiMessage.find({ user: req.user._id }).select("-doc.text").sort({ createdAt: 1 }).limit(500)
    res.status(200).json({ messages })
  } catch (error) {
    console.log("getAiMessages error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const sendAiMessage = async (req, res) => {
  try {
    const me = req.user
    const file = req.file || null
    if (file && !isImage(file) && !isDoc(file)) return res.status(400).json({ error: "Nexa can read photos, PDFs, Word documents and text files" })
    const media = file ? null : parseMedia(req.body.media)
    if (req.body.media && !file && !media) return res.status(400).json({ error: "That GIF or sticker can't be sent" })
    const text = String(req.body.message || "").trim() || (file ? (isImage(file) ? "What's in this photo?" : "Summarize this document.") : "")
    if (!text && !media) return res.status(400).json({ error: "Ask something first" })
    if (text.length > MAX_INPUT) return res.status(400).json({ error: `Please keep it under ${MAX_INPUT} characters` })

    const id = String(me._id)
    const now = Date.now()
    recent[id] = (recent[id] || []).filter((t) => now - t < 60_000)
    if (recent[id].length >= LIMIT_PER_MINUTE) return res.status(429).json({ error: "You're asking quickly. Wait a moment and try again." })
    recent[id].push(now)

    // A photo or document: answered right here (no tools)
    if (file) return answerAboutFile(req, res, { me, file, text })

    // "What can you do?" -> instant, consistent answer with a capabilities card
    if (!media && CAPABILITY_RE.test(text) && text.length < 80) {
      const question = await AiMessage.create({ user: me._id, role: "user", content: text })
      const answer = await AiMessage.create({ user: me._id, role: "assistant", content: CAPABILITIES_TEXT, actions: [{ type: "capabilities" }] })
      return res.status(201).json({ question, answer })
    }

    const ctx = await loadNexaContext(me, safeTimeZone(req.body.timeZone))
    // Keep the brief on the user's current local time
    if (ctx.google && ctx.google.timeZone !== ctx.timeZone) GoogleAccount.updateOne({ _id: ctx.google._id }, { timeZone: ctx.timeZone }).catch(() => {})
    const history = (await AiMessage.find({ user: me._id }).sort({ createdAt: -1 }).limit(HISTORY)).reverse()
    const question = await AiMessage.create({ user: me._id, role: "user", content: text, attachment: media })
    // A GIF or sticker: Nexa sees its title and replies in kind (short and friendly)
    const asked = media
      ? `${text ? `${text}\n` : ""}[I ${attachmentNote(media)}. Reply naturally and briefly to it, matching its mood.]`
      : text

    // Let the model call tools until it gives a final answer
    const earlier = historyFor(history)
    // What this question is about (decides which instructions and tools are sent)
    const prev = history.slice(-2).map((m) => String(m.content || "").slice(0, 300)).join(" ")
    const intents = intentsFor(asked, prev, ctx)
    let trimmed = false
    // A document from the last few messages: give Nexa the parts that matter for this question
    const recentDoc = [...history].reverse().find((m) => m.doc?.text)?.doc
    const docNote = recentDoc && !media
      ? [{ role: "system", content: `The user shared the document "${recentDoc.name}" earlier in this chat. If the question is about it, answer from these parts of it:\n---\n${excerptFor(recentDoc.text, text, 4000)}\n---` }]
      : []
    const convo = [
      { role: "system", content: systemPrompt(me, ctx, intents) },
      ...docNote,
      ...earlier,
      { role: "user", content: asked },
    ]
    const actions = []
    const sources = []
    let reply = ""
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        // An image request: the first turn must call generate_image (the model sometimes refuses otherwise)
        const forceImage = round === 0 && !media && wantsImage(text)
        const options = { tools: toolsFor(ctx, intents, forceImage), maxTokens: 1500, ...(forceImage ? { toolChoice: FORCE_IMAGE } : {}) }
        let msg
        try {
          msg = await groqChat(convo, options)
        } catch (err) {
          if (err.code !== "too_large") throw err
          // Still too big: drop the earlier chat and leave less room for the reply
          if (!trimmed) { convo.splice(1, earlier.length); trimmed = true }
          msg = await groqChat(convo, { ...options, maxTokens: 1000 })
        }
        sources.push(...sourcesOf(msg.executed_tools))
        if (!msg.tool_calls?.length) { reply = msg.content?.trim() || ""; break }
        convo.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls })
        for (const callItem of msg.tool_calls) {
          let args = {}
          try { args = JSON.parse(callItem.function.arguments || "{}") } catch { /* bad JSON: tool reports it */ }
          const { result, action } = await runNexaTool(callItem.function.name, args, ctx)
          if (action) actions.push(action)
          convo.push({ role: "tool", tool_call_id: callItem.id, content: JSON.stringify(result) })
        }
      }
    } catch (err) {
      // Nothing happened and no answer: keep the question out of the history
      if (!actions.length) {
        await AiMessage.deleteOne({ _id: question._id })
        return res.status(503).json({ error: err.message })
      }
    }
    if (!reply) reply = actions.length ? "Done." : "Sorry, I couldn't finish that. Could you rephrase?"
    // Replies to a GIF or sticker sometimes come back as a quote
    if (media) reply = reply.replace(/^>\s?/gm, "")
    const links = sources.filter((s, i) => sources.findIndex((o) => o.url === s.url) === i).slice(0, 4)
    if (links.length) actions.push({ type: "sources", items: links })

    const answer = await AiMessage.create({ user: me._id, role: "assistant", content: reply, actions })
    res.status(201).json({ question, answer })
  } catch (error) {
    console.log("sendAiMessage error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// ── Photos and documents sent to Nexa ──────────────────────────
const fileSystemPrompt = (me) => `You are Nexa, the AI assistant in Kova, talking with ${me.fullName}.
Answer in the user's language. By default use short bullet points; use a Markdown table when it helps (receipts, comparisons, data). Never use HTML tags like <br>; in a table cell separate items with "; ".
Only state what you can actually see in the photo or read in the document. If something is unclear or unreadable, say so.
Never use em or en dashes.`

const answerAboutFile = async (req, res, { me, file, text }) => {
  let stored = null
  try {
    const image = isImage(file)
    let doc = null
    if (!image) {
      doc = await extractDocText(file).catch(() => null)
      if (!doc?.text) return res.status(400).json({ error: "I couldn't find any text in that file. If it's a scan, send it as a photo instead." })
    }
    stored = await uploadToCloudinary(file, { subfolder: "ai-uploads" })
    const attachment = { kind: image ? "image" : "file", url: stored.url, publicId: stored.publicId, resourceType: stored.resourceType, name: file.originalname, size: stored.size, mimeType: file.mimetype, width: stored.width, height: stored.height }

    const history = (await AiMessage.find({ user: me._id }).sort({ createdAt: -1 }).limit(4)).reverse()
    const question = await AiMessage.create({ user: me._id, role: "user", content: text, attachment, doc: doc ? { name: file.originalname, pages: doc.pages, text: doc.text, truncated: doc.truncated } : null })

    let reply
    try {
      if (image) {
        const msg = await groqChat([
          { role: "system", content: fileSystemPrompt(me) },
          ...historyFor(history, 1500),
          { role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: imageForModel(file, stored.url) } }] },
        ], { model: VISION_MODEL(), only: true, maxTokens: 1200, temperature: 0.3 })
        reply = msg.content?.trim()
      } else {
        const about = `Document: "${file.originalname}"${doc.pages ? `, ${doc.pages} pages` : ""}${doc.truncated ? " (very long; only the start was kept)" : ""}.`
        const msg = await groqChat([
          { role: "system", content: fileSystemPrompt(me) },
          { role: "system", content: `${about}\nHere is the document text (or the parts most relevant to the question):\n---\n${excerptFor(doc.text, text, 7000)}\n---` },
          ...historyFor(history, 1200),
          { role: "user", content: text },
        ], { maxTokens: 1200, temperature: 0.3 })
        reply = msg.content?.trim()
      }
    } catch (err) {
      await AiMessage.deleteOne({ _id: question._id })
      deleteFromCloudinary([stored])
      return res.status(503).json({ error: err.message })
    }

    const answer = await AiMessage.create({ user: me._id, role: "assistant", content: reply || "Sorry, I couldn't read that. Try another file?" })
    const { doc: _omit, ...plainQuestion } = question.toObject()
    res.status(201).json({ question: plainQuestion, answer })
  } catch (error) {
    console.log("answerAboutFile error:", error?.message || error)
    if (stored) deleteFromCloudinary([stored])
    res.status(500).json({ error: "Nexa couldn't read that file" })
  }
}

// ── One Nexa message: delete, keep; and the chat's disappearing timer ──
export const deleteAiMessage = async (req, res) => {
  try {
    const m = await AiMessage.findOne({ _id: req.params.id, user: req.user._id })
    if (!m) return res.status(404).json({ error: "Message not found" })
    await AiMessage.deleteOne({ _id: m._id })
    deleteFromCloudinary(nexaFiles(m))
    res.json({ deleted: String(m._id) })
  } catch (error) {
    console.log("deleteAiMessage error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const keepAiMessage = async (req, res) => {
  try {
    const m = await AiMessage.findOne({ _id: req.params.id, user: req.user._id }).select("-doc.text")
    if (!m) return res.status(404).json({ error: "Message not found" })
    const kept = req.body.kept !== false
    const secs = req.user.nexaDisappearAfter ?? 86400
    m.kept = kept
    m.expiresAt = kept || !secs ? null : new Date(Date.now() + secs * 1000)
    await m.save()
    res.json({ message: m })
  } catch (error) {
    console.log("keepAiMessage error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const getAiSettings = (req, res) => res.json({ disappearAfter: req.user.nexaDisappearAfter ?? 86400 })

// Changing the timer applies to every message not kept (off = nothing disappears)
export const setAiSettings = async (req, res) => {
  try {
    const secs = Number(req.body.disappearAfter)
    if (!TIMER_CHOICES.includes(secs)) return res.status(400).json({ error: "Choose off, 24 hours, 7 days or 90 days" })
    await User.updateOne({ _id: req.user._id }, { nexaDisappearAfter: secs })
    await AiMessage.updateMany({ user: req.user._id, kept: { $ne: true } }, { $set: { expiresAt: secs ? new Date(Date.now() + secs * 1000) : null } })
    res.json({ disappearAfter: secs })
  } catch (error) {
    console.log("setAiSettings error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const clearAiMessages = async (req, res) => {
  try {
    const withFiles = await AiMessage.find({ user: req.user._id, $or: [{ "actions.type": "image" }, { attachment: { $ne: null } }] }, { actions: 1, attachment: 1 })
    await AiMessage.deleteMany({ user: req.user._id })
    // Free the Cloudinary space of pictures Nexa made and files sent to Nexa
    deleteFromCloudinary(withFiles.flatMap((m) => [...m.actions.filter((a) => a?.type === "image" && a.publicId), ...(m.attachment?.publicId ? [m.attachment] : [])]))
    res.status(200).json({ cleared: true })
  } catch (error) {
    console.log("clearAiMessages error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// ── Create a picture Nexa was asked for ──────────────────────
// Made on the server (utils/imageGen.js, no sign-in for anyone), then kept on Cloudinary
const IMAGES_PER_DAY = Number(process.env.NEXA_IMAGES_PER_DAY) || 15
const imageUse = new Map() // userId -> { day, count }  (resets on restart; the cap protects the shared allowance)
const drawing = new Set()  // action ids being drawn right now

export const createAiImage = async (req, res) => {
  const actionId = String(req.body.actionId || "")
  try {
    const message = await AiMessage.findOne({ _id: req.params.id, user: req.user._id, role: "assistant" })
    const index = message?.actions.findIndex((a) => a?.type === "image" && a.id === actionId) ?? -1
    if (index < 0) return res.status(404).json({ error: "Image not found" })
    if (message.actions[index].url) return res.status(200).json({ action: message.actions[index] })
    if (drawing.has(actionId)) return res.status(409).json({ error: "Already creating this image" })

    const today = new Date().toISOString().slice(0, 10)
    const use = imageUse.get(String(req.user._id))
    const count = use?.day === today ? use.count : 0
    if (count >= IMAGES_PER_DAY) return res.status(429).json({ error: `You've reached today's limit of ${IMAGES_PER_DAY} images. Try again tomorrow.` })

    drawing.add(actionId)
    try {
      const { prompt, shape } = message.actions[index]
      const made = await generateImage(prompt, shape)
      imageUse.set(String(req.user._id), { day: today, count: count + 1 })
      const stored = await uploadToCloudinary({ buffer: made.buffer, mimetype: made.mimetype, originalname: "nexa-image" }, { subfolder: "ai-images", transformation: made.transformation })

      // Re-read: the chat may have changed (or been cleared) while drawing
      const fresh = await AiMessage.findOne({ _id: message._id, user: req.user._id })
      const i = fresh?.actions.findIndex((a) => a?.type === "image" && a.id === actionId) ?? -1
      if (i < 0) {
        deleteFromCloudinary([stored])
        return res.status(404).json({ error: "Image not found" })
      }
      const action = { ...fresh.actions[i], url: stored.url, publicId: stored.publicId, resourceType: "image", width: stored.width, height: stored.height }
      fresh.actions[i] = action
      fresh.markModified("actions")
      await fresh.save()
      res.status(200).json({ action })
    } finally {
      drawing.delete(actionId)
    }
  } catch (error) {
    if (error.cause) console.log("createAiImage error:", error.cause)
    else if (!error.status) console.log("createAiImage error:", error?.message || error)
    res.status(error.status || 500).json({ error: error.status ? error.message : "Couldn't create the image" })
  }
}

// ── Rewrite a draft (the ✨ button in the message box) ─────────
const STYLES = {
  shorten: "Make it shorter and clearer. Keep the meaning and the tone.",
  professional: "Make it professional and polite, suitable for work.",
  friendly: "Make it warm, friendly and casual.",
  grammar: "Fix spelling, grammar and punctuation only. Keep the wording otherwise.",
  english: "Translate it into natural English.",
}

export const rewriteText = async (req, res) => {
  try {
    const text = String(req.body.text || "").trim()
    const instruction = STYLES[req.body.style]
    if (!text) return res.status(400).json({ error: "Type a message first" })
    if (!instruction) return res.status(400).json({ error: "Unknown style" })
    if (text.length > MAX_INPUT) return res.status(400).json({ error: `Please keep it under ${MAX_INPUT} characters` })

    const id = String(req.user._id)
    const now = Date.now()
    recent[id] = (recent[id] || []).filter((t) => now - t < 60_000)
    if (recent[id].length >= LIMIT_PER_MINUTE) return res.status(429).json({ error: "Too many requests. Wait a moment." })
    recent[id].push(now)

    const rewritten = await askGroq([
      {
        role: "system",
        content: `You rewrite chat messages. ${instruction}
Return ONLY the rewritten message: no quotes, no explanations, no options. Keep any names, emoji and links. Write as the same person (first person).`,
      },
      { role: "user", content: text },
    ], { maxTokens: 600, temperature: 0.4 })
    res.status(200).json({ text: rewritten.replace(/^["“]|["”]$/g, "").trim() })
  } catch (error) {
    console.log("rewriteText error:", error.message)
    res.status(503).json({ error: error.message || "Couldn't rewrite that. Try again." })
  }
}

// ── Scheduled messages ─────────────────────────────────────

// My scheduled messages; `?chat=<userId|groupId>` limits it to one chat
export const listScheduled = async (req, res) => {
  try {
    const me = req.user._id
    const filter = { sender: me, status: req.query.all ? { $in: ["pending", "sent", "cancelled", "failed"] } : "pending" }
    if (req.query.chat) {
      const chat = String(req.query.chat)
      filter.$or = String(me) === chat ? [{ receiver: me }] : [{ receiver: chat }, { group: chat }]
    }
    const items = await ScheduledMessage.find(filter).sort({ sendAt: 1 }).limit(100)
      .populate("receiver", "fullName username").populate("group", "name")
    res.status(200).json({ scheduled: items })
  } catch (error) {
    console.log("listScheduled error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const cancelScheduled = async (req, res) => {
  try {
    const job = await ScheduledMessage.findOneAndUpdate(
      { _id: req.params.id, sender: req.user._id, status: "pending" },
      { $set: { status: "cancelled" } },
      { new: true },
    )
    if (!job) return res.status(404).json({ error: "It was already sent or cancelled" })
    emitToUsers([req.user._id], "scheduledUpdated", { id: String(job._id), status: "cancelled" })
    res.status(200).json({ cancelled: String(job._id) })
  } catch (error) {
    console.log("cancelScheduled error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// ── Nexa inside chats ──────────────────────────────────────

// Separate, roomier limits for the quick helpers
const buckets = {}
const allow = (userId, bucket, perMinute) => {
  const key = `${bucket}:${userId}`
  const now = Date.now()
  buckets[key] = (buckets[key] || []).filter((t) => now - t < 60_000)
  if (buckets[key].length >= perMinute) return false
  buckets[key].push(now)
  return true
}
const zoneOf = (req) => safeTimeZone(req.headers["x-time-zone"] || req.body?.timeZone)
const FAST_MODEL = "openai/gpt-oss-20b"

// Pull the first JSON array out of a model reply
const parseList = (text) => {
  const match = String(text).match(/\[[\s\S]*\]/)
  try { return match ? JSON.parse(match[0]) : [] } catch { return [] }
}

export const nexaInfo = async (req, res) => {
  const bot = await getNexaBot()
  res.status(200).json({ botId: String(bot._id), username: bot.username })
}

// 2–3 short replies to the last message someone else sent in this chat
export const smartReplies = async (req, res) => {
  try {
    const me = req.user._id
    if (!allow(me, "smart", 30)) return res.status(200).json({ replies: [] })
    const chat = await readChat(me, String(req.body.chatId || ""), { count: 12, timeZone: zoneOf(req) })
    const last = chat?.messages[chat.messages.length - 1]
    if (!last || String(last.senderId) === String(me) || last.call || !messageText(last).trim()) return res.status(200).json({ replies: [] })

    const text = await askGroq([
      {
        role: "system",
        content: `Suggest 3 short replies the user ("Me") could send to the latest message in this chat.
- Each reply under 8 words, natural and casual, in the same language as the chat.
- Make them different (e.g. yes / no or later / a question). At most one emoji in total.
- Return ONLY a JSON array of 3 strings.`,
      },
      { role: "user", content: chat.lines.join("\n") },
    ], { model: FAST_MODEL, maxTokens: 300, temperature: 0.7 })
    const replies = parseList(text).filter((r) => typeof r === "string" && r.trim()).map((r) => r.trim().slice(0, 80)).slice(0, 3)
    res.status(200).json({ replies, for: String(last._id) })
  } catch (error) {
    console.log("smartReplies error:", error.message)
    res.status(200).json({ replies: [] })
  }
}

// Short summary of the newest messages in a chat ("Catch me up")
export const catchUp = async (req, res) => {
  try {
    const me = req.user._id
    if (!allow(me, "catchup", 10)) return res.status(429).json({ error: "Too many requests. Wait a moment." })
    const unread = Math.min(80, Math.max(3, Number(req.body.count) || 20))
    const chat = await readChat(me, String(req.body.chatId || ""), { count: unread + 6, timeZone: zoneOf(req) })
    if (!chat) return res.status(403).json({ error: "You can't read that chat" })
    if (!chat.lines.length) return res.status(200).json({ summary: "Nothing new here." })
    const summary = await askGroq([
      {
        role: "system",
        content: `Catch the user ("Me") up on ${chat.isGroup ? `the group "${chat.name}"` : `their chat with ${chat.name}`}.
The last ${unread} messages are new to them; earlier ones are context.
Write 2–4 short bullets: what happened, who said what (use names), and anything that needs their reply or decision.
"Me" in the messages is the user: call them "you". No heading, no intro line.`,
      },
      { role: "user", content: chat.lines.join("\n") },
    ], { maxTokens: 500 })
    res.status(200).json({ summary })
  } catch (error) {
    console.log("catchUp error:", error.message)
    res.status(503).json({ error: error.message || "Couldn't summarize right now." })
  }
}

// Translate one message into the reader's language
export const translateMessage = async (req, res) => {
  try {
    const me = req.user._id
    if (!allow(me, "translate", 20)) return res.status(429).json({ error: "Too many requests. Wait a moment." })
    const message = await Message.findById(req.params.id).catch(() => null)
    if (!(await canSeeMessage(me, message))) return res.status(404).json({ error: "Message not found" })
    const source = [message.message, message.transcript].filter(Boolean).join("\n")
    if (!source.trim()) return res.status(400).json({ error: "Nothing to translate" })

    let language = "English"
    try { language = new Intl.DisplayNames(["en"], { type: "language" }).of(String(req.body.language || "en").split("-")[0]) || "English" } catch { /* default */ }
    const text = await askGroq([
      { role: "system", content: `Translate the message into ${language}. If it's already in ${language}, return it unchanged. Return ONLY the translation.` },
      { role: "user", content: source },
    ], { model: FAST_MODEL, maxTokens: 600, temperature: 0.2 })
    res.status(200).json({ text, language })
  } catch (error) {
    console.log("translateMessage error:", error.message)
    res.status(503).json({ error: error.message || "Couldn't translate right now." })
  }
}

// Turn a voice note into text (saved, so everyone in the chat sees it and summaries can use it)
export const transcribeMessage = async (req, res) => {
  try {
    const me = req.user._id
    const message = await Message.findById(req.params.id).catch(() => null)
    if (!(await canSeeMessage(me, message))) return res.status(404).json({ error: "Message not found" })
    const a = message.attachment
    if (!a || !(a.kind === "audio" || a.mimeType?.startsWith("audio/") || a.mimeType?.startsWith("video/"))) return res.status(400).json({ error: "That isn't a voice note" })
    if (message.transcript !== null) return res.status(200).json(message)
    if (!allow(me, "transcribe", 10)) return res.status(429).json({ error: "Too many requests. Wait a moment." })
    if (a.size > 24 * 1024 * 1024) return res.status(400).json({ error: "That recording is too long to transcribe" })

    const file = await fetch(a.url, { signal: AbortSignal.timeout(30_000) })
    if (!file.ok) return res.status(502).json({ error: "Couldn't download the voice note" })
    const audio = Buffer.from(await file.arrayBuffer())
    const text = await groqTranscribe(audio, a.name || "voice.webm", a.mimeType || "audio/webm")
    message.transcript = text || "(no speech detected)"
    await message.save()
    await notifyAudience(message, "messageEdited", message, me)
    res.status(200).json(message)
  } catch (error) {
    console.log("transcribeMessage error:", error.message)
    res.status(503).json({ error: error.message || "Couldn't transcribe right now." })
  }
}

// "Remind me about this": a reminder in my Message yourself chat, linking back to the message
export const remindAboutMessage = async (req, res) => {
  try {
    const me = req.user._id
    const message = await Message.findById(req.params.id).catch(() => null)
    if (!(await canSeeMessage(me, message))) return res.status(404).json({ error: "Message not found" })
    const sendAt = new Date(req.body.sendAt)
    if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() < Date.now() + 15_000) return res.status(400).json({ error: "Pick a time in the future" })
    if (sendAt.getTime() > Date.now() + 366 * 24 * 3600_000) return res.status(400).json({ error: "Reminders can be up to a year ahead" })

    // Where the message lives, and who wrote it
    let chatId, chatName, isGroup = false
    if (message.groupId) {
      const g = await Group.findById(message.groupId).select("name")
      chatId = String(message.groupId); chatName = g?.name || "a group"; isGroup = true
    } else {
      const other = String(message.senderId) === String(me) ? message.receiverId : message.senderId
      chatId = String(other)
      chatName = String(other) === String(me) ? "Message yourself" : (await User.findById(other).select("fullName"))?.fullName || "a chat"
    }
    const author = String(message.senderId) === String(me) ? "you" : (await User.findById(message.senderId).select("fullName"))?.fullName || "someone"
    const snippet = messageText(message).replace(/\s+/g, " ").slice(0, 140)
    const text = isGroup
      ? `⏰ Reminder: "${snippet}" (${author} in ${chatName})`
      : `⏰ Reminder: "${snippet}" (${author === "you" ? `you, to ${chatName}` : `from ${author}`})`

    const job = await ScheduledMessage.create({ sender: me, receiver: me, text, sendAt, ref: { messageId: String(message._id), chatId, isGroup, chatName } })
    emitToUsers([me], "scheduledUpdated", { id: String(job._id), status: "pending" })
    res.status(201).json({ id: String(job._id), sendAt: job.sendAt })
  } catch (error) {
    console.log("remindAboutMessage error:", error.message)
    res.status(500).json({ error: "Couldn't set the reminder" })
  }
}
