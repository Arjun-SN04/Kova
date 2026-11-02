import { askGroq } from "./groq.js"

// Does a message ask Nexa to MAKE a picture? Shared by the Nexa chat and @Nexa in chats,
// so both understand the request the first time, including typos and follow-ups.

// Includes common typos ("iamge", "imgae", "img")
export const IMAGE_NOUNS = "images?|imag|iamges?|imgaes?|imges?|imgs?|pictures?|pics?|photos?|drawings?|paintings?|illustrations?|posters?|logos?|art|artwork|wallpapers?|stickers?|cartoons?|avatars?|icons?|banners?|portraits?|sketch(?:es)?|renders?"
const VERBS = "create|make|generate|genrate|genarate|draw|design|paint|sketch|imagine|render|illustrate|produce|redo|remake|recreate|improve|edit|show me|give me|i want|i need|i'?d like|can i (?:get|have)"
export const IMAGE_RE = new RegExp(
  `\\b(?:${VERBS})\\b[\\s\\S]{0,80}\\b(?:${IMAGE_NOUNS})\\b`
  + `|^\\s*(?:please\\s+|pls\\s+|can you\\s+|could you\\s+|nexa,?\\s+)?(?:draw|paint|sketch|illustrate|imagine)\\b`
  + `|\\b(?:a|an|some)\\s+(?:\\w+\\s+)?(?:${IMAGE_NOUNS})\\s+(?:of|showing|with)\\b`
  + `|\\b(?:make|create|generate|give me|do)\\b[\\s\\S]{0,20}\\b(?:another|a better|a new|one more)\\b[\\s\\S]{0,20}\\b(?:one|version|image|iamge|pic)\\b`,
  "i",
)
// Not a request to make one: app help, describing a photo, sending a photo
const NOT_IMAGE_RE = /\b(how (do|can|to) (i )?(send|attach|change|set|upload|delete)|profile (pic|picture|photo)|send (a |the |my )?(photo|pic|picture|image) to|attach|what('s| is) in (this|the|that) (photo|pic|picture|image)|describe (this|the|that|my) (photo|pic|picture|image))\b/i
export const LOOSE_IMAGE_RE = new RegExp(`\\b(?:${IMAGE_NOUNS}|draw|paint|sketch)\\b`, "i")
// Nexa said it can't make pictures
export const REFUSED_IMAGE_RE = /\b(can(no|'|’)?t|cannot|unable to|not able to|don['’]?t have the (ability|capability) to|i['’]?m (just )?a text)\b[^.\n]{0,50}\b(generate|create|make|draw|produce|images?|pictures?)\b/i
// Nexa says it made a picture, but nothing was attached
export const CLAIMED_IMAGE_RE = /\b(here('s| is| are)|i('ve| have) (made|created|generated|drawn)|created|generated)\b[^\n]{0,80}\b(images?|pictures?|pics?|versions?|drawings?|illustrations?|art(work)?)\b/i
// A short change right after Nexa made a picture: "make it blue", "now at night", "again"
const EDIT_RE = /^\s*(now|ok(ay)?|and|but|also|pls|please)?[\s,]*(make|change|turn|add|remove|put|give|try|redo|again|another|more|less|with|without|same|but|in|at|as|bigger|smaller|darker|brighter|cuter|realistic|animated|anime|cartoon|colou?r)\b/i

// recent: the last few lines of the chat; lastWasImage: Nexa's latest answer was a picture
export const asksForImage = async (text, { recent = "", lastWasImage = false } = {}) => {
  const q = String(text || "").trim()
  if (!q || q.length > 600 || NOT_IMAGE_RE.test(q)) return false
  if (IMAGE_RE.test(q)) return true
  if (lastWasImage && q.length < 160 && EDIT_RE.test(q)) return true
  // Wording varies ("whip up a cat", "yes do it", "one with a dog"): ask the model when it's plausible
  if (!LOOSE_IMAGE_RE.test(q) && !(lastWasImage && q.length < 160) && !(LOOSE_IMAGE_RE.test(recent) && q.length < 80)) return false
  try {
    const out = await askGroq([
      {
        role: "system",
        content: `Decide if the user's LATEST message asks the assistant to CREATE, MAKE, EDIT, REDO or CHANGE a picture/image (including "yes, do it" after the assistant offered one, or a change to a picture the assistant just made). Describing, discussing or sending an existing photo is "no". Answer only yes or no.`,
      },
      { role: "user", content: `${recent ? `Recent chat:\n${String(recent).slice(-900)}\n\n` : ""}Latest message: ${q}` },
    ], { maxTokens: 3, temperature: 0 })
    return /^\s*yes/i.test(String(out))
  } catch { return false }
}
