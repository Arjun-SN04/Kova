import { Group } from "../models/group.model.js"
import { Conversation } from "../models/conversation.model.js"
import User from "../models/user.model.js"
import { Message } from "../models/message.model.js"
import { getNexaBot } from "./nexaBot.js"
import { askGroq } from "./groq.js"
import { VISION_MODEL, excerptFor, extractDocText, isDoc } from "./aiFiles.js"
import { readChat } from "./chatAccess.js"
import { emitToUsers } from "./notify.js"
import { fileDownloadUrl, uploadToCloudinary } from "../config/cloudinary.js"
import { generateImage } from "./imageGen.js"
import { wantsCreative, writeCreative } from "./creative.js"

export const MENTION_RE = /(^|[^\w@])@nexa\b/i
const PER_MINUTE = 6          // answers per group per minute
const busy = new Set()        // groups Nexa is answering right now
const recent = {}             // groupId -> timestamps

// ── What Nexa looks at: photos and documents in the chat ──
// The message they replied to, the file sent with the question, or (when the question is
// about one, or one was just shared) the latest few photos / the latest document.
const PHOTO_WORDS = /\b(photos?|pics?|pictures?|images?|iamges?|imgaes?|imges?|imgs?|screenshots?|selfie|this|these|that|it|look|see|who|describe|caption|colou?rs?|wearing|where|above|reference|refrence|similar|like|better|same)\b/i
const DOC_WORDS = /\b(pdf|docs?|documents?|files?|resume|cv|report|sheet|csv|txt|attachment|this|it|summari[sz]e|summary|read)\b/i
const isPhoto = (m) => m?.attachment?.kind === "image" && m.attachment.url
const isDocMsg = (m) => !!m?.attachment?.url && isDoc({ mimetype: m.attachment.mimeType })
const forModel = (url) => String(url).replace("/upload/", "/upload/w_1280,q_auto,f_jpg/")
const thumb = (url) => String(url).replace("/upload/", "/upload/w_160,h_160,c_fill,q_auto,f_jpg/")
const photoRef = (m) => ({ messageId: String(m._id), kind: "image", name: m.attachment.name || "Photo", url: thumb(m.attachment.url) })
const docRef = (m) => ({ messageId: String(m._id), kind: "file", name: m.attachment.name || "Document" })

const sourcesFor = async (message, recentMessages = []) => {
  const target = message.replyTo ? await Message.findById(message.replyTo).select("attachment") : null
  const own = isPhoto(message) || isDocMsg(message) ? message : null
  const chosen = own || (isPhoto(target) || isDocMsg(target) ? target : null)
  if (chosen) return { photos: isPhoto(chosen) ? [chosen] : [], docs: isDocMsg(chosen) ? [chosen] : [] }
  const before = recentMessages.filter((m) => String(m._id) !== String(message._id))
  const text = message.message || ""
  const recentPhotos = before.slice(-8).filter(isPhoto)
  const photos = recentPhotos.length && (before.slice(-3).some(isPhoto) || PHOTO_WORDS.test(text)) ? recentPhotos.slice(-4) : []
  const recentDocs = before.slice(-10).filter(isDocMsg)
  const docs = recentDocs.length && (before.slice(-3).some(isDocMsg) || DOC_WORDS.test(text)) ? recentDocs.slice(-1) : []
  return { photos, docs }
}

// Download a document from the chat and keep the part that matters for the question
const docText = async (m, question) => {
  try {
    const res = await fetch(fileDownloadUrl(m.attachment, 5))
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    const { text, pages } = await extractDocText({ mimetype: m.attachment.mimeType, buffer })
    if (!text) return null
    return `Document "${m.attachment.name || "document"}"${pages ? ` (${pages} pages)` : ""}:\n${excerptFor(text, question, 7000)}`
  } catch (err) {
    console.log("nexa doc read error:", err.message)
    return null
  }
}

// Ask Nexa with the chosen photos and documents. Returns { reply, refs }.
const askNexa = async (system, userText, sources, question) => {
  const refs = []
  let sys = system
  const docBlocks = []
  for (const d of sources.docs) {
    const block = await docText(d, question)
    if (block) { docBlocks.push(block); refs.push(docRef(d)) }
  }
  if (docBlocks.length) sys += `\n\nThe document they mean (answer only from it; if it doesn't say, say so):\n${docBlocks.join("\n\n")}`
  else if (sources.docs.length) sys += `\n\nThey're asking about a document ("${sources.docs[0].attachment?.name || "file"}") that you couldn't open. Say you couldn't read it and suggest sending it again. Never guess what it says.`
  if (sources.photos.length) {
    try {
      const reply = await askGroq([
        { role: "system", content: `${sys}\n\n${sources.photos.length === 1 ? "The photo they mean is attached." : `The ${sources.photos.length} most recent photos from the chat are attached, oldest first.`} Look at it carefully and answer about what you actually see. If something isn't clear in the image, say so.` },
        { role: "user", content: [{ type: "text", text: userText }, ...sources.photos.map((m) => ({ type: "image_url", image_url: { url: forModel(m.attachment.url) } }))] },
      ], { model: VISION_MODEL(), only: true, maxTokens: 1500, temperature: 0.3 })
      return { reply, refs: [...sources.photos.map(photoRef), ...refs] }
    } catch (err) {
      console.log("nexa photo answer error:", err.message)
    }
  }
  const reply = await askGroq([{ role: "system", content: sys }, { role: "user", content: userText }], { maxTokens: 2500 })
  return { reply, refs }
}

// ── Special requests: "draw / create an image …" and "summarise / recap the chat" ──
// Includes common typos ("iamge", "imgae", "img") and "a better / another one" follow-ups
const IMAGE_NOUNS = "images?|imag|iamges?|imgaes?|imges?|imgs?|pictures?|pics?|photos?|drawings?|illustrations?|posters?|logos?|art|artwork|wallpapers?|stickers?|cartoons?|avatars?|banners?|cards?|portraits?|scenes?|versions?"
const IMAGE_RE = new RegExp(`\\b(create|make|generate|draw|design|paint|sketch|imagine|render|illustrate|redo|remake|recreate|improve|edit)\\b[\\s\\S]{0,80}\\b(${IMAGE_NOUNS})\\b|^(draw|paint|sketch|illustrate)\\b|\\b(make|create|generate|give me|do)\\b[\\s\\S]{0,20}\\b(another|a better|a new|one more)\\b[\\s\\S]{0,20}\\b(one|version|image|iamge|pic)\\b`, "i")
// Nexa said it can't make pictures: never leave it at that
const REFUSED_IMAGE_RE = /\b(can(no|')?t|cannot|unable to|not able to|don'?t have the ability to)\b[^.\n]{0,40}\b(generate|create|make|draw|produce)\b[^.\n]{0,30}\b(images?|pictures?|art|photos?)\b/i
const LOOSE_IMAGE_RE = new RegExp(`\\b(${IMAGE_NOUNS})\\b`, "i")
// Nexa says it made a picture but nothing was attached
const CLAIMED_IMAGE_RE = /\b(here('s| is| are)|i('ve| have) (made|created|generated|drawn)|created|generated)\b[^\n]{0,80}\b(images?|pictures?|pics?|versions?|drawings?|illustrations?|art(work)?)\b/i

// Wording varies ("whip up", "can you do one…"): when an image is mentioned, ask the model
const asksForImage = async (question) => {
  if (IMAGE_RE.test(question)) return true
  if (!LOOSE_IMAGE_RE.test(question)) return false
  try {
    const out = await askGroq([
      { role: "system", content: "Does this message ask the assistant to CREATE, MAKE, EDIT, REDO or IMPROVE a picture/image (not just describe or discuss one)? Answer only yes or no." },
      { role: "user", content: question.slice(0, 600) },
    ], { maxTokens: 3, temperature: 0 })
    return /^\s*yes/i.test(String(out))
  } catch { return false }
}
const SUMMARY_RE = /\b(summar(y|ies|ise|ize|ising|izing)|conclusions?|conclude|recap|tl;?dr|wrap(\s|-)?up|overview|key points|minutes|what (did|have) we (decide|discuss|agree)|catch me up)\b/i
const IMAGES_PER_DAY = 10
const imageUse = new Map() // userId -> { day, count }

// What the reference photos look like, so a new image can follow them
const describeReferences = async (photos, question) => {
  if (!photos?.length) return ""
  try {
    return String(await askGroq([
      { role: "system", content: `These photos are references for a new AI image. In under 90 words, describe what matters for recreating their look: the people or subjects (appearance, clothes, pose), setting, art style, colours and lighting. Plain description only.` },
      { role: "user", content: [{ type: "text", text: `Request: ${question}` }, ...photos.map((m) => ({ type: "image_url", image_url: { url: forModel(m.attachment.url) } }))] },
    ], { model: VISION_MODEL(), only: true, maxTokens: 250, temperature: 0.2 })).trim()
  } catch (err) {
    console.log("nexa reference photo error:", err.message)
    return ""
  }
}

const makeImage = async ({ question, chat, sender, photos = [] }) => {
  const day = new Date().toISOString().slice(0, 10)
  const use = imageUse.get(String(sender._id))
  const count = use?.day === day ? use.count : 0
  if (count >= IMAGES_PER_DAY) return { reply: `- You've reached today's limit of ${IMAGES_PER_DAY} images. Try again tomorrow.` }
  // Turn the request (and the chat, if it refers to it) into a picture description
  let plan = { prompt: question, shape: "square", caption: "" }
  const reference = await describeReferences(photos, question)
  try {
    const raw = await askGroq([
      {
        role: "system",
        content: `Turn ${sender.fullName}'s request into one prompt for an AI image generator.
If the request refers to the chat ("our plan", "this conversation", "what we discussed"), use those details from the recent messages.
Return ONLY JSON: {"prompt": "a vivid visual description under 70 words, with style and lighting", "shape": "square" | "portrait" | "landscape", "caption": "a short friendly caption under 14 words"}.
Shape: "wider", "shorter", "wide shot", "not a close-up", "banner", "desktop" = landscape; "taller", "phone wallpaper", "story" = portrait; otherwise square.
Don't put written words in the image unless they asked for text.
Make original characters; never recreate famous copyrighted characters.
"Better", "more natural", "animated" and similar mean: improve on the reference or the last image with that feel ("animated" = a lively animated-film art style).${reference ? `\nReference photos from the chat (follow their subjects and look): ${reference}` : ""}

Recent messages:
${chat?.lines.slice(-25).join("\n") || "(none)"}`,
      },
      { role: "user", content: question },
    ], { maxTokens: 300, temperature: 0.6 })
    const parsed = JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] || "{}")
    if (parsed.prompt) plan = { prompt: String(parsed.prompt).slice(0, 600), shape: ["square", "portrait", "landscape"].includes(parsed.shape) ? parsed.shape : "square", caption: String(parsed.caption || "").slice(0, 120) }
  } catch { /* fall back to their own words */ }
  const made = await generateImage(plan.prompt, plan.shape)
  const stored = await uploadToCloudinary({ buffer: made.buffer, mimetype: made.mimetype, originalname: "nexa-image.jpg" }, { subfolder: "ai-images", transformation: made.transformation })
  imageUse.set(String(sender._id), { day, count: count + 1 })
  return {
    reply: plan.caption || "Here you go",
    refs: photos.map(photoRef),
    attachment: { url: stored.url, publicId: stored.publicId, resourceType: "image", kind: "image", name: "nexa-image.jpg", size: stored.size, mimeType: stored.mimeType || "image/jpeg", width: stored.width, height: stored.height },
  }
}

// A proper summary of the whole chat (last 150 messages)
const summarizeChat = async ({ viewerId, chatId, sender, where, timeZone }) => {
  const full = await readChat(viewerId, chatId, { count: 150, timeZone })
  if (!full?.lines.length) return { reply: "- There's nothing to summarise yet." }
  const reply = await askGroq([
    {
      role: "system",
      content: `Summarise ${where} for ${sender.fullName}. "Me" in the messages is ${sender.fullName}; messages from "Nexa" are your own earlier answers (leave them out unless they matter).
Write in this shape, using people's first names, no em or en dashes:
One short opening line: what the chat was about.
**Key points**
- 2 to 5 bullets
**Decisions**
- what was agreed (leave this section out if nothing was decided)
**To-dos**
- who does what, and by when if mentioned (leave this section out if there are none)
**Conclusion**
One or two lines that wrap it up.`,
    },
    { role: "user", content: full.lines.join("\n") },
  ], { maxTokens: 900 })
  return { reply }
}

// Image or summary when that's what they asked for; null otherwise
const specialAnswer = async ({ question, chat, sender, viewerId, chatId, where, timeZone, photos = [], force = false }) => {
  if (force || await asksForImage(question)) {
    try { return await makeImage({ question, chat, sender, photos }) } catch (err) {
      console.log("nexa image error:", err.message)
      return { reply: "- Sorry, I couldn't create the image right now. Try again in a minute." }
    }
  }
  if (SUMMARY_RE.test(question)) return summarizeChat({ viewerId, chatId, sender, where, timeZone })
  // Poems, songs, shayari: careful draft + rhyme check
  if (wantsCreative(question)) {
    try { return { reply: await writeCreative(question, `Asked by ${sender.fullName} in ${where}.`) } } catch (err) {
      console.log("nexa creative error:", err.message)
    }
  }
  return null
}

// Someone wrote "@Nexa …" in a group: answer there, for everyone, as a reply to their message
export const answerMention = async ({ groupId, message, sender, timeZone = "UTC" }) => {
  const gid = String(groupId)
  if (!MENTION_RE.test(message.message || "") || busy.has(gid)) return
  const now = Date.now()
  recent[gid] = (recent[gid] || []).filter((t) => now - t < 60_000)
  if (recent[gid].length >= PER_MINUTE) return
  recent[gid].push(now)
  busy.add(gid)

  const group = await Group.findById(gid).select("members name")
  const bot = await getNexaBot()
  const typing = (event) => emitToUsers(group.members, event, { from: gid, user: String(bot._id), name: event === "typing" ? "Nexa" : undefined })
  typing("typing")
  try {
    const chat = await readChat(sender._id, gid, { count: 40, timeZone })
    const question = String(message.message).replace(MENTION_RE, "$1").trim() || "(they just mentioned you)"
    let reply
    let refs = []
    let attachment = null
    try {
      const sources = await sourcesFor(message, chat?.messages)
      const specialArgs = { question, chat, sender, viewerId: sender._id, chatId: gid, where: `the group "${group.name}"`, timeZone, photos: sources.photos }
      const special = await specialAnswer(specialArgs)
      if (special) ({ reply, attachment = null, refs = [] } = special)
      else ({ reply, refs } = await askNexa(`You are Nexa, the AI assistant inside the Kova group "${group.name}". ${sender.fullName} mentioned you, and your answer is posted in the group for everyone.
In the recent messages below, "Me" means ${sender.fullName}. Messages from "Nexa" are your own earlier answers.
Pick the format that fits what they asked for:
- Poem, song, shayari or verse: an original, deeply moving piece. A short **title** line, followed by rich, beautifully developed couplets or stanzas (7 to 10 shers for shayari, 4 to 6 stanzas for poems; each couplet or stanza separated by a blank line). Capture genuine emotion, musical rhythm, evocative imagery, and authentic vocabulary. Never write dry, rushed, or shallow couplets. Never use bullets.
- Story, letter, message to send, speech or wish: well-developed, expressive, evocative paragraphs with heart and substance.
- Steps, options, comparisons or several facts: clearly structured "- " bullets (numbered for sequential steps).
- Questions, discussions or explanations: thorough, articulate, helpful, and insightful.
Provide rich, complete, and satisfying responses. Never cut answers artificially short or withhold depth. Never reproduce existing song lyrics, poems or book text; write your own original words.
Use people's first names exactly as written (never shorten them). No headings, no em or en dashes. Always do what they ask; never say you can't create images (pictures are made separately when asked). If asked to decide or pick, pick clearly and say why in one line.

Recent messages:
${chat?.lines.join("\n") || "(none)"}`, `${sender.fullName}: ${question}`, sources, question))
      // It said it can't make pictures, but they asked for one: make it
      if (!attachment && (REFUSED_IMAGE_RE.test(reply || "") || CLAIMED_IMAGE_RE.test(reply || "")) && LOOSE_IMAGE_RE.test(question)) {
        const made = await specialAnswer({ ...specialArgs, force: true })
        if (made) ({ reply, attachment = null, refs = [] } = made)
      }
    } catch {
      reply = "Sorry, I can't answer right now. Try again in a minute."
    }
    const msg = await Message.create({ senderId: bot._id, groupId: gid, message: reply, replyTo: message._id, nexaRefs: refs.length ? refs : undefined, attachment })
    await Group.updateOne({ _id: gid }, { $set: { updatedAt: new Date() } })
    emitToUsers(group.members, "newMessage", msg)
  } finally {
    typing("stopTyping")
    busy.delete(gid)
  }
}

// "@Nexa …" in a one-to-one chat (or Message yourself): answer there, visible to both people
export const answerDirectMention = async ({ sender, otherId, message, timeZone = "UTC" }) => {
  if (!MENTION_RE.test(message.message || "")) return
  const me = String(sender._id)
  const other = String(otherId)
  const key = `dm:${[me, other].sort().join(":")}`
  if (busy.has(key)) return
  const now = Date.now()
  recent[key] = (recent[key] || []).filter((t) => now - t < 60_000)
  if (recent[key].length >= PER_MINUTE) return
  recent[key].push(now)
  busy.add(key)

  const bot = await getNexaBot()
  const people = me === other ? [me] : [me, other]
  // Each person sees the typing in their chat with the other one
  const typing = (event) => {
    emitToUsers([other], event, { from: me, user: String(bot._id), name: event === "typing" ? "Nexa" : undefined }, me === other ? null : undefined)
    if (me !== other) emitToUsers([me], event, { from: other, user: String(bot._id), name: event === "typing" ? "Nexa" : undefined })
  }
  typing("typing")
  try {
    const self = me === other
    const otherName = self ? "" : (await User.findById(other).select("fullName"))?.fullName || "the other person"
    const chat = await readChat(me, other, { count: 30, timeZone })
    const question = String(message.message).replace(MENTION_RE, "$1").trim() || "(they just mentioned you)"
    let reply
    let refs = []
    let attachment = null
    try {
      const sources = await sourcesFor(message, chat?.messages)
      const specialArgs = { question, chat, sender, viewerId: me, chatId: other, where: self ? "their private notes chat" : `their chat with ${otherName}`, timeZone, photos: sources.photos }
      const special = await specialAnswer(specialArgs)
      if (special) ({ reply, attachment = null, refs = [] } = special)
      else ({ reply, refs } = await askNexa(`You are Nexa, the AI assistant inside Kova. ${sender.fullName} mentioned you in ${self ? "their private notes chat" : `their private chat with ${otherName}`}, and your answer is posted in that chat${self ? "" : " for both of them"}.
In the recent messages below, "Me" means ${sender.fullName}. Messages from "Nexa" are your own earlier answers.
Pick the format that fits what they asked for:
- Poem, song, shayari or verse: an original, deeply moving piece. A short **title** line, followed by rich, beautifully developed couplets or stanzas (7 to 10 shers for shayari, 4 to 6 stanzas for poems; each couplet or stanza separated by a blank line). Capture genuine emotion, musical rhythm, evocative imagery, and authentic vocabulary. Never write dry, rushed, or shallow couplets. Never use bullets.
- Story, letter, message to send, speech or wish: well-developed, expressive, evocative paragraphs with heart and substance.
- Steps, options, comparisons or several facts: clearly structured "- " bullets (numbered for sequential steps).
- Questions, discussions or explanations: thorough, articulate, helpful, and insightful.
Provide rich, complete, and satisfying responses. Never cut answers artificially short or withhold depth. Never reproduce existing song lyrics, poems or book text; write your own original words.
Use people's first names exactly as written. No headings, no em or en dashes. Always do what they ask; never say you can't create images (pictures are made separately when asked).

Recent messages:
${chat?.lines.join("\n") || "(none)"}`, `${sender.fullName}: ${question}`, sources, question))
      if (!attachment && (REFUSED_IMAGE_RE.test(reply || "") || CLAIMED_IMAGE_RE.test(reply || "")) && LOOSE_IMAGE_RE.test(question)) {
        const made = await specialAnswer({ ...specialArgs, force: true })
        if (made) ({ reply, attachment = null, refs = [] } = made)
      }
    } catch {
      reply = "- Sorry, I can't answer right now. Try again in a minute."
    }

    let conversation = self
      ? await Conversation.findOne({ members: { $size: 2 }, "members.0": me, "members.1": me })
      : await Conversation.findOne({ members: { $all: [me, other] } })
    if (!conversation) return
    const msg = await Message.create({
      senderId: bot._id,
      receiverId: me,
      botChat: people,
      message: reply,
      replyTo: message._id,
      nexaRefs: refs.length ? refs : undefined,
      attachment,
      seen: true,
    })
    conversation.messages.push(msg._id)
    await conversation.save()
    emitToUsers(people, "newMessage", msg)
  } finally {
    typing("stopTyping")
    busy.delete(key)
  }
}
