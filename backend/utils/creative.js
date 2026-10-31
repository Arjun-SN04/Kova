import { askGroq } from "./groq.js"

// Poems, songs and shayari get their own path: a careful draft, then an editor pass that
// checks every rhyme. The quick everyday answer path writes flat, unrhymed verse.

const FORMS = "poem|poems|poetry|poetic|verse|verses|shayari|shayri|sher|ghazal|nazm|kavita|song|songs|lyrics|rap|haiku|limerick|sonnet|ballad|rhyme|rhymes|rhyming|lullaby|jingle|couplets?|quatrains?"
const ASK_RE = new RegExp(`\\b(write|compose|make|create|give|pen|craft|draft|need|want|share|do|send|generate|cook up|whip up|come up with|can you|could you|please)\\b[\\s\\S]{0,80}\\b(${FORMS})\\b|^\\s*(a |an )?(${FORMS})\\b`, "i")
// Questions about poems rather than requests for one
const ABOUT_RE = /\b(explain|meaning|analy[sz]e|analysis|summar|who wrote|what is a|what's a|difference between|history of|translate)\b/i

export const wantsCreative = (text = "") => {
  const t = String(text)
  return t.length < 800 && ASK_RE.test(t) && !ABOUT_RE.test(t)
}

const WRITER = `You are a gifted poet, lyricist and shayar. Write the piece the person asked for, so it truly moves them.

Heart first:
- Before writing, imagine one specific moment between the people (a rainy bus stop, chai going cold while they talk, her laugh on a late phone call, waiting outside her college). Build the piece around that moment and a real feeling: longing, shyness, gratitude, missing someone, a promise.
- Speak directly to the person ("you" / "tum" / "tu") from the point of view they asked for. Show feelings through small, concrete details (her dupatta in the wind, a voice note at 2 am, the way she says my name) instead of naming the feeling.
- Give it an arc: an opening image, a deepening, and a last line or sher that lands with a twist or a quiet promise.

Craft:
- Original work only. Never reproduce or lightly change existing lyrics, poems, shayari or book text. If they ask for an existing song's lyrics, say in one line that you can't share them, then write an original piece in that mood.
- Use the language of the request: English for English; Hindi/Urdu shayari or Hinglish in the same language and script they typed in.
- Follow any form, length, rhyme scheme or style they ask for. Otherwise:
  - Poem or song: 3 stanzas of 4 lines, rhyme scheme AABB.
  - Shayari: 4 to 5 shers (2-line couplets). In each sher the two lines end on DIFFERENT words that rhyme (raat / baat, nazar / safar, dil / manzil, pyaar / intezaar, aankhein / baatein, sitaare / hamare). No sher may end both lines on the same word.
  - Haiku: 5-7-5 syllables, no rhyme.
- Plan the rhymes first: choose each pair of end words (true rhymes, all different, none reused anywhere in the piece), then write lines that land on them naturally.
- Real rhymes that sound alike when spoken. Never pair words that don't rhyme, never "rhyme" a word with itself, no filler words just to force a rhyme.
- Rich, varied vocabulary: don't repeat the same words or images (no "teri ... teri ... teri" on every line, no "dil" in every sher). Each line should add something new.
- Short lines: 6 to 10 words each, of similar length, smooth to say aloud. Never long prose sentences.
- Avoid clichés ("heart beats like a drum", "endless sky", "light up my world", "chand jaisa chehra").

Output: a short **Title** on the first line, a blank line, then the stanzas or shers, each line on its own line and a blank line between them. Nothing else: no intro, no notes.`

const EDITOR = `You are a demanding poetry editor. You get a request, a draft and a list of problems.
1. Fix every listed problem first: rewrite those exact lines so the end words are different and truly rhyme, and replace repeated words.
2. Then make it better: sharper concrete details, more feeling, smoother rhythm, a stronger last line. Cut anything generic or clichéd.
3. Keep the language, script, point of view, form and number of stanzas/shers.
Return ONLY the final piece in the same format (**Title**, blank line, stanzas with blank lines between). No notes.`

const clean = (text) => {
  let out = String(text || "")
    .replace(/^```[a-z]*\n?|```$/gim, "")
    .replace(/^\s*(here('s| is)[^\n]*|sure[^\n]*|certainly[^\n]*)\n+/i, "")
    .replace(/[ \t]+$/gm, "")
    .trim()
  // The title is always bold
  const [first, ...rest] = out.split("\n")
  if (first && rest[0] === "" && first.length < 70 && !/^\*\*.*\*\*$/.test(first.trim())) out = [`**${first.replace(/^#+\s*|\*+/g, "").trim()}**`, ...rest].join("\n")
  return out
}

// ── A rough rhyme checker, so the editor gets concrete problems to fix ──
const lastWord = (line) => (String(line).toLowerCase().match(/[\p{L}\p{M}']+(?=[^\p{L}\p{M}']*$)/u)?.[0] || "").replace(/'/g, "")
const LATIN = /^[a-z]+$/
// The sound at the end of a word: from its last vowel group (silent final "e" dropped)
const tail = (w) => {
  if (!LATIN.test(w)) return w.slice(-2) // Devanagari and others: compare the last two characters
  const base = w.length > 3 && /[^aeiouy]e$/.test(w) ? w.slice(0, -1) : w
  const m = base.match(/[aeiouy]+[^aeiouy]*$/)
  return m ? m[0] : base.slice(-2)
}
const rhymes = (a, b) => !!a && !!b && a !== b && tail(a) === tail(b)

// Problems like "line 4 ends with 'paper', the same word as line 3"
export const rhymeProblems = (poem) => {
  const stanzas = poem.split(/\n\s*\n/).map((st) => st.split("\n").filter((l) => l.trim() && !/^\*\*.*\*\*$/.test(l.trim()))).filter((st) => st.length >= 2)
  const problems = []
  let lineNo = 0
  for (const st of stanzas) {
    const words = st.map(lastWord)
    const at = (i) => lineNo + i + 1
    let pairs
    if (st.length === 4) {
      const aabb = [[0, 1], [2, 3]], abab = [[0, 2], [1, 3]]
      const score = (ps) => ps.filter(([x, y]) => rhymes(words[x], words[y])).length
      pairs = score(abab) > score(aabb) ? abab : aabb
    } else {
      pairs = []
      for (let i = 0; i + 1 < st.length; i += 2) pairs.push([i, i + 1])
    }
    for (const [x, y] of pairs) {
      if (!words[x] || !words[y]) continue
      if (words[x] === words[y]) problems.push(`Line ${at(y)} ends with "${words[y]}", the same word as line ${at(x)}. Rewrite line ${at(y)} to end on a different word that truly rhymes with "${words[x]}".`)
      else if (!rhymes(words[x], words[y])) problems.push(`Lines ${at(x)} ("${words[x]}") and ${at(y)} ("${words[y]}") should rhyme but don't. Rewrite one of them so the endings sound alike.`)
    }
    // The same end word twice in a stanza is a cheat, even if it "rhymes"
    const seen = new Map()
    words.forEach((w, i) => {
      if (!w) return
      if (seen.has(w) && !problems.some((p) => p.includes(`line ${at(i)}`) || p.includes(`Line ${at(i)} `))) problems.push(`Line ${at(i)} ends with "${w}", already used at the end of line ${at(seen.get(w))}. Use a different end word (and keep the rhyme).`)
      else seen.set(w, i)
    })
    lineNo += st.length
  }
  return problems
}

// Roman-letter request answered in Devanagari (or the other way round)
const scriptProblem = (request, poem) => {
  const body = poem.split("\n").slice(1).join("\n")
  const wantsDeva = /[\u0900-\u097F]/.test(request)
  const hasDeva = /[\u0900-\u097F]/.test(body)
  if (!wantsDeva && hasDeva) return "The piece is in Devanagari, but they typed in Roman letters. Rewrite the whole piece in Roman Hindi (Latin letters), keeping it rhyming."
  if (wantsDeva && !hasDeva && /\b(hai|mein|dil|tum)\b/i.test(body)) return "They wrote in Devanagari: rewrite the whole piece in Devanagari script."
  return null
}
// Words the piece leans on too much ("khwab" three times, "dhadkan" everywhere)
const COMMON = new Set("the and that with your you for from into this when like have will just what then they them their there where while been were your yours mine meri mera mere teri tera tere tumhe tumko tumhari hamari hamara apni apna apne main mein hum hai hain tha thi the hoga hogi kya koi kuch bhi nahi nahin aur par pe se ko ka ki ke ek yeh woh jab tab sab saath har bas hi toh".split(" "))
const repeatProblems = (poem) => {
  const body = poem.split("\n").filter((l) => l.trim() && !/^\*\*.*\*\*$/.test(l.trim()))
  const counts = new Map()
  for (const w of body.join(" ").toLowerCase().match(/[\p{L}\p{M}']+/gu) || []) {
    if (w.length < 4 || COMMON.has(w)) continue
    counts.set(w, (counts.get(w) || 0) + 1)
  }
  const over = [...counts].filter(([, n]) => n >= 3).map(([w, n]) => `"${w}" (${n} times)`)
  const dupLines = body.length - new Set(body.map((l) => l.trim().toLowerCase())).size
  return [
    ...(over.length ? [`These words are repeated too much: ${over.join(", ")}. Use each at most twice; find fresh words and images.`] : []),
    ...(dupLines ? ["Some lines are repeated word for word. Every line must be different."] : []),
  ]
}
// Poems need short lines; long ones read like prose
const lengthProblems = (poem) => {
  const lines = poem.split("\n").filter((l) => l.trim() && !/^\*\*.*\*\*$/.test(l.trim()))
  const long = lines.map((l, i) => [i + 1, l.trim().split(/\s+/).length]).filter(([, n]) => n > 11)
  return long.length ? [`Lines ${long.map(([i]) => i).join(", ")} are too long (over 11 words). Cut every line to 6 to 10 words; keep the rhyme.`] : []
}
// End words used twice anywhere in the piece
const reusedEnds = (poem) => {
  const ends = poem.split("\n").filter((l) => l.trim() && !/^\*\*.*\*\*$/.test(l.trim())).map(lastWord).filter(Boolean)
  const dup = [...new Set(ends.filter((w, i) => ends.indexOf(w) !== i))]
  return dup.length ? [`These end words are used more than once: ${dup.map((w) => `"${w}"`).join(", ")}. Every line must end on a different word.`] : []
}
const problemsOf = (request, poem) => [scriptProblem(request, poem), ...rhymeProblems(poem), ...reusedEnds(poem), ...repeatProblems(poem), ...lengthProblems(poem)].filter(Boolean)

const scriptNote = (request) => /[ऀ-ॿ]/.test(request)
  ? "Write in Devanagari script, as they did."
  : /[؀-ۿ]/.test(request) ? "Write in the same script they used."
    : "Use Latin letters. If the piece is in Hindi or Urdu, write it in Roman Hindi (Latin letters), the way they typed, never in Devanagari."

// context: optional notes (who is asking, recent chat) to personalise the piece
export const writeCreative = async (request, context = "") => {
  const ask = `${context ? `${context}\n` : ""}${scriptNote(request)}\n\nRequest: ${request}`
  // Three drafts at once (different temperatures); the one with the fewest problems goes on
  const drafts = (await Promise.allSettled([0.8, 0.95, 1.05].map((temperature) => askGroq([
    { role: "system", content: WRITER },
    { role: "user", content: ask },
  ], { maxTokens: 3500, temperature, reasoning: "medium" }))))
    .filter((r) => r.status === "fulfilled").map((r) => clean(r.value)).filter((d) => d.split("\n").length >= 3)
  if (!drafts.length) throw new Error("No poem came back")
  let best = drafts[0]
  let bestProblems = problemsOf(request, best)
  for (const d of drafts.slice(1)) {
    const p = problemsOf(request, d)
    if (p.length < bestProblems.length) { best = d; bestProblems = p }
  }

  // Editor rounds with the exact problems to fix; keep whichever version has the fewest problems
  for (let round = 0; round < 2; round++) {
    try {
      const fixed = clean(await askGroq([
        { role: "system", content: EDITOR },
        { role: "user", content: `Request: ${request}\n${scriptNote(request)}\n\nDraft:\n${best}\n\nProblems to fix:\n- ${bestProblems.length ? bestProblems.join("\n- ") : "None found: just polish it for feeling and freshness."}` },
      ], { maxTokens: 3500, temperature: 0.6, reasoning: "medium" }))
      if (!fixed || fixed.split("\n").length < Math.min(4, best.split("\n").length)) break
      const problems = problemsOf(request, fixed)
      if (problems.length <= bestProblems.length) { best = fixed; bestProblems = problems }
      if (!bestProblems.length && round >= 0) break
    } catch { break }
  }
  return best
}
