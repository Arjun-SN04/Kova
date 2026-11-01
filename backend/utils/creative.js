import { askGroq } from "./groq.js"

// Poems, songs and shayari get their own dedicated high-caliber creative path
const CREATIVE_FORMS = /\b(shayari|shayri|shairi|shayeri|shayree|ghazal|nazm|kavita|haiku|sonnet|limerick|couplets?|shers?)\b/i
const GENERAL_FORMS = /\b(poems?|poetry|poetic|verses?|songs?|lyrics|rap|ballad|rhymes?|rhyming|lullaby|jingle)\b/i
const CREATIVE_VERBS = /\b(write|wrtite|wrtie|writ|wrte|rite|compose|make|create|generate|give|tell|say|recite|suggest|drop|share|send|pen|craft|draft|sing|cook up|whip up|come up with|need|want|can you|could you|please)\b/i
const ABOUT_RE = /\b(explain|meaning|analy[sz]e|analysis|summar|who wrote|what is a|what's a|difference between|history of|translate)\b/i

export const wantsCreative = (text = "") => {
  const t = String(text || "").trim()
  if (!t || t.length > 1200) return false
  if (ABOUT_RE.test(t)) return false
  if (CREATIVE_VERBS.test(t) && (CREATIVE_FORMS.test(t) || GENERAL_FORMS.test(t))) return true
  if (CREATIVE_FORMS.test(t)) return true
  if (GENERAL_FORMS.test(t) && /\b(romantic|love|sad|heart|emotional|dosti|friendship|deep|short|beautiful|sweet|cute|breakup|attitude|for|about|on)\b/i.test(t)) return true
  return false
}

const WRITER = `You are a master poet, lyricist, and shayar of the highest caliber. Your verses move the soul with profound emotional depth, authentic human observations, evocative imagery, and lyrical melody.

Soul & Emotional Depth:
- Write with genuine warmth, sincerity, and poetic reverence. Avoid cheap clichés ("dil fida ho gaya", "duniya haseen ho gaya", "chand jaisa chehra", "heart beats like a drum").
- Notice intimate, sensory, real-life details: her unhurried smile making troubles fade away, how silence becomes a language of love, the quiet grace when she tucks her hair, loving someone completely even before holding them close, seeing a whole universe of stars in a single glance.
- Create a moving progression: from quiet awe and admiration to timeless devotion.

Art of Hindi/Urdu Shayari & Ghazal:
- For Hindi/Urdu or Hinglish, write in natural, lyrical Roman Hindi (or Devanagari if requested) using rich, culturally resonant vocabulary:
  (e.g., nazar, tabassum, khamoshi, bepanah, saadgi, dastak, deedar, intezaar, noor, husn, rooh, zulf, aashiqui, mehsoos, chahat).
- Rhyme & Meter (Qafia & Radif):
  * Use natural poetic cadence: either rhyming words (Qafia: e.g. thehar/utar, dikhti/likhti, adhoora/pheeka, chaahne/paane, haseen/kareeb) followed by a melodious refrain (Radif: "sa jaata hai", "lagti hai", "lagta hoon", "hai", "lage"), or harmonious couplet endings.
  * Lines should be substantial, rhythmic, and natural to recite aloud (9 to 16 words per misra)—never unnaturally short or stilted.
- Substance & Length:
  * For Shayari: write 7 to 10 rich, beautifully developed shers (couplets). Give the reader an expansive, satisfying, emotionally deep experience.
  * For Poems / Songs: write 4 to 6 full stanzas (4 lines each) with rich musicality.
  * If the user specifies an exact length or style, follow their request.

Language & Script:
- Match the user's language and script:
  * Roman Hindi / Hinglish if they asked in Roman letters.
  * Devanagari if they wrote in Devanagari script.
  * Expressive English if they asked for an English poem/song.

Format:
**Title**

[Couplet / Stanza 1]

[Couplet / Stanza 2]

(Separate each couplet or stanza with a blank line. Output only the title and verses—no conversational preamble, no commentary, no notes.)`

const EDITOR = `You are an acclaimed poetry editor and master shayar.
You receive a creative request, a draft, and optional notes.
Elevate the piece to the highest level of poetic beauty:
1. Deepen the emotional resonance, imagery, and vocabulary. Ensure the metaphors are fresh and touching.
2. Maintain the generous length (7 to 10 couplets for shayari, or 4 to 6 stanzas for poems). NEVER shorten or cut out verses.
3. Polish the rhythm and rhyme flow (Qafia & Radif) so every line rolls off the tongue with natural musicality.
Return ONLY the final piece in the same format (**Title**, blank line, stanzas/shers with blank lines between). No notes or intro.`

const clean = (text) => {
  let out = String(text || "")
    .replace(/^```[a-z]*\n?|```$/gim, "")
    .replace(/^\s*(here('s| is)[^\n]*|sure[^\n]*|certainly[^\n]*)\n+/i, "")
    .replace(/[ \t]+$/gm, "")
    .trim()
  // The title is always bold
  const [first, ...rest] = out.split("\n")
  if (first && rest[0] === "" && first.length < 80 && !/^\*\*.*\*\*$/.test(first.trim())) {
    out = [`**${first.replace(/^#+\s*|\*+/g, "").trim()}**`, ...rest].join("\n")
  }
  return out
}

const wordsOf = (line) =>
  (String(line).toLowerCase().match(/[\p{L}\p{M}']+/gu) || []).map((w) => w.replace(/'/g, ""))

const lastWord = (line) => {
  const ws = wordsOf(line)
  return ws[ws.length - 1] || ""
}

const LATIN = /^[a-z]+$/
const tail = (w) => {
  if (!LATIN.test(w)) return w.slice(-2)
  const base = w.length > 3 && /[^aeiouy]e$/.test(w) ? w.slice(0, -1) : w
  const m = base.match(/[aeiouy]+[^aeiouy]*$/)
  return m ? m[0] : base.slice(-2)
}

const wordRhymes = (a, b) => {
  if (!a || !b) return false
  if (a === b) return true
  const ta = tail(a), tb = tail(b)
  if (ta === tb) return true
  if (/[aeiouy]$/.test(a) && /[aeiouy]$/.test(b) && a.slice(-1) === b.slice(-1)) return true
  if ((a.endsWith("aan") || a.endsWith("ahan") || a.endsWith("an")) && (b.endsWith("aan") || b.endsWith("ahan") || b.endsWith("an"))) return true
  return false
}

// Couplet rhyme checker that understands both direct rhymes and traditional Radif + Qafia
const coupletMatches = (lineA, lineB) => {
  const wa = wordsOf(lineA)
  const wb = wordsOf(lineB)
  if (!wa.length || !wb.length) return true
  const la = wa[wa.length - 1]
  const lb = wb[wb.length - 1]

  if (la !== lb && wordRhymes(la, lb)) return true

  let common = 0
  while (
    common < Math.min(wa.length, wb.length) - 1 &&
    wa[wa.length - 1 - common] === wb[wb.length - 1 - common]
  ) {
    common++
  }

  if (common >= 1) {
    const qafiaA = wa[wa.length - 1 - common]
    const qafiaB = wb[wb.length - 1 - common]
    if (wordRhymes(qafiaA, qafiaB)) return true
  }

  return false
}

export const rhymeProblems = (poem) => {
  const stanzas = poem.split(/\n\s*\n/).map((st) => st.split("\n").filter((l) => l.trim() && !/^\*\*.*\*\*$/.test(l.trim()))).filter((st) => st.length >= 2)
  const problems = []
  let lineNo = 0
  for (const st of stanzas) {
    const at = (i) => lineNo + i + 1
    if (st.length === 2) {
      if (!coupletMatches(st[0], st[1])) {
        const la = lastWord(st[0]), lb = lastWord(st[1])
        if (la === lb) {
          problems.push(`Lines ${at(0)} and ${at(1)} end on the same word "${lb}" without a distinct rhyming Qafia preceding it. Ensure the rhyme sounds melodic.`)
        }
      }
    }
    lineNo += st.length
  }
  return problems
}

const scriptProblem = (request, poem) => {
  const body = poem.split("\n").slice(1).join("\n")
  const wantsDeva = /[\u0900-\u097F]/.test(request)
  const hasDeva = /[\u0900-\u097F]/.test(body)
  if (!wantsDeva && hasDeva) return "The piece is in Devanagari, but they typed in Roman letters. Rewrite the whole piece in Roman Hindi (Latin letters), keeping it rhyming."
  if (wantsDeva && !hasDeva && /\b(hai|mein|dil|tum)\b/i.test(body)) return "They wrote in Devanagari: rewrite the whole piece in Devanagari script."
  return null
}

const COMMON = new Set("the and that with your you for from into this when like have will just what then they them their there where while been were your yours mine meri mera mere teri tera tere tumhe tumko tumhari hamari hamara apni apna apne main mein hum hai hain tha thi the hoga hogi kya koi kuch bhi nahi nahin aur par pe se ko ka ki ke ek yeh woh jab tab sab saath har bas hi toh".split(" "))
const repeatProblems = (poem) => {
  const body = poem.split("\n").filter((l) => l.trim() && !/^\*\*.*\*\*$/.test(l.trim()))
  const counts = new Map()
  for (const w of body.join(" ").toLowerCase().match(/[\p{L}\p{M}']+/gu) || []) {
    if (w.length < 4 || COMMON.has(w)) continue
    counts.set(w, (counts.get(w) || 0) + 1)
  }
  const over = [...counts].filter(([, n]) => n >= 6).map(([w, n]) => `"${w}" (${n} times)`)
  const dupLines = body.length - new Set(body.map((l) => l.trim().toLowerCase())).size
  return [
    ...(over.length ? [`These words are repeated excessively: ${over.join(", ")}. Find fresh metaphors and varied vocabulary.`] : []),
    ...(dupLines ? ["Some lines are repeated word for word. Every line must be distinct."] : []),
  ]
}

const lengthProblems = (poem) => {
  const lines = poem.split("\n").filter((l) => l.trim() && !/^\*\*.*\*\*$/.test(l.trim()))
  const long = lines.map((l, i) => [i + 1, l.trim().split(/\s+/).length]).filter(([, n]) => n > 22)
  return long.length ? [`Lines ${long.map(([i]) => i).join(", ")} read like prose (over 22 words). Keep lyrical meter intact.`] : []
}

const RADIF_WORDS = new Set("hai hain tha thi the hoon hu gaya gaye gayi lage lagti lagta ho se mein ko pe kar toh na bhi tu tum kare karein diya diye jaata jaati jaate rahe rahi raha".split(" "))
const reusedEnds = (poem) => {
  const ends = poem.split("\n").filter((l) => l.trim() && !/^\*\*.*\*\*$/.test(l.trim())).map(lastWord).filter(Boolean)
  const dup = [...new Set(ends.filter((w, i) => ends.indexOf(w) !== i))].filter((w) => !RADIF_WORDS.has(w))
  return dup.length > 3 ? [`Non-refrain end words used repeatedly: ${dup.map((w) => `"${w}"`).join(", ")}. Ensure diverse rhymes.`] : []
}

const problemsOf = (request, poem) => [scriptProblem(request, poem), ...rhymeProblems(poem), ...reusedEnds(poem), ...repeatProblems(poem), ...lengthProblems(poem)].filter(Boolean)

const scriptNote = (request) => /[ऀ-ॿ]/.test(request)
  ? "Write in Devanagari script, as they did."
  : /[؀-ۿ]/.test(request) ? "Write in the same script they used."
    : "Use Latin letters. If the piece is in Hindi or Urdu, write it in Roman Hindi (Latin letters), the way they typed, never in Devanagari."

export const writeCreative = async (request, context = "") => {
  const ask = `${context ? `${context}\n` : ""}${scriptNote(request)}\n\nRequest: ${request}`
  const drafts = (await Promise.allSettled([0.75, 0.85, 0.95].map((temperature) => askGroq([
    { role: "system", content: WRITER },
    { role: "user", content: ask },
  ], { maxTokens: 4000, temperature, reasoning: "medium" }))))
    .filter((r) => r.status === "fulfilled").map((r) => clean(r.value)).filter((d) => d.split("\n").length >= 5)
  if (!drafts.length) throw new Error("No poem came back")
  let best = drafts[0]
  let bestProblems = problemsOf(request, best)
  for (const d of drafts.slice(1)) {
    const p = problemsOf(request, d)
    if (p.length < bestProblems.length || (p.length === bestProblems.length && d.length > best.length)) {
      best = d
      bestProblems = p
    }
  }

  // 1 round of editor refinement with generous output space
  for (let round = 0; round < (bestProblems.length ? 2 : 1); round++) {
    try {
      const fixed = clean(await askGroq([
        { role: "system", content: EDITOR },
        { role: "user", content: `Request: ${request}\n${scriptNote(request)}\n\nDraft:\n${best}\n\nNotes for improvement:\n- ${bestProblems.length ? bestProblems.join("\n- ") : "Polish for deeper feeling, musical cadence, and vivid imagery. Preserve the full length and all couplets."}` },
      ], { maxTokens: 4000, temperature: 0.7, reasoning: "medium" }))
      if (!fixed || fixed.split("\n").length < Math.min(8, best.split("\n").length)) break
      const problems = problemsOf(request, fixed)
      if (problems.length <= bestProblems.length) { best = fixed; bestProblems = problems }
      if (!bestProblems.length && round >= 0) break
    } catch { break }
  }
  return best
}

