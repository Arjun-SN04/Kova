// Files sent to Nexa: photos (read with a vision model) and documents (PDF, Word, text) to summarise or ask about.

export const VISION_MODEL = () => process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b"

export const isImage = (file) => /^image\/(jpeg|png|webp|gif)$/.test(file?.mimetype || "")
const DOC_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/csv": "csv",
}
export const isDoc = (file) => !!DOC_TYPES[file?.mimetype || ""]

const MAX_DOC_CHARS = 200_000 // what we keep of a document for follow-up questions

// Text of a PDF / Word / text file → { text, pages }
export const extractDocText = async (file) => {
  const kind = DOC_TYPES[file.mimetype]
  let text = ""
  let pages = null
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf")
    const pdf = await getDocumentProxy(new Uint8Array(file.buffer))
    const out = await extractText(pdf, { mergePages: true })
    text = out.text
    pages = out.totalPages
  } else if (kind === "docx") {
    const mammoth = (await import("mammoth")).default
    text = (await mammoth.extractRawText({ buffer: file.buffer })).value
  } else {
    text = file.buffer.toString("utf8")
  }
  text = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  return { text: text.slice(0, MAX_DOC_CHARS), pages, truncated: text.length > MAX_DOC_CHARS }
}

// ── Picking the parts of a long document that matter for a question ──
const STOP = new Set("the a an and or of to in on for with is are was were be this that it its what which who how why when where do does did can could should would will about from into your you me my i we our they them their there here than then as at by not no yes please tell give show explain summarize summarise summary document doc file pdf page pages text".split(" "))
const words = (s) => (s.toLowerCase().match(/[a-z0-9ऀ-ॿ]{3,}/g) || []).filter((w) => !STOP.has(w))

// Up to `budget` characters of `text`: the whole thing if it fits, otherwise the chunks that share
// the most words with the question (plus the start), or an even spread for "summarise this".
export const excerptFor = (text, question, budget = 7000) => {
  if (text.length <= budget) return text
  const size = 1200
  const chunks = []
  for (let i = 0; i < text.length; i += size) chunks.push({ i: chunks.length, text: text.slice(i, i + size) })
  const q = new Set(words(question))
  const scored = chunks.map((c) => ({ ...c, score: words(c.text).reduce((n, w) => n + (q.has(w) ? 1 : 0), 0) }))
  const keep = Math.max(1, Math.floor(budget / (size + 20)))
  let picked
  if (!q.size || scored.every((c) => c.score === 0)) {
    // No keywords: spread evenly so a summary sees the whole document
    const step = chunks.length / keep
    picked = Array.from({ length: keep }, (_, k) => chunks[Math.floor(k * step)])
  } else {
    picked = [chunks[0], ...scored.filter((c) => c.i !== 0).sort((a, b) => b.score - a.score).slice(0, keep - 1)]
  }
  return picked.sort((a, b) => a.i - b.i).map((c) => c.text).join("\n[…]\n")
}

// Groq accepts images as data URLs (up to ~4 MB). Larger ones use a smaller Cloudinary version.
export const imageForModel = (file, storedUrl) =>
  file.buffer.length <= 3_500_000
    ? `data:${file.mimetype};base64,${file.buffer.toString("base64")}`
    : String(storedUrl).replace("/upload/", "/upload/w_1600,q_auto/")
