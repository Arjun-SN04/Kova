import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts"
import { askGroq } from "./groq.js"

// Hindi / Hinglish voice. Groq's Orpheus only speaks English, so Hindi gets an
// English accent there. Here:
//   1. the AI rewrites Roman Hindi ("Tere bina yeh zindagi") in Devanagari so it's
//      pronounced properly, picks a female or male voice and a mood per stanza;
//   2. Microsoft's neural Indian voices (free Edge "Read aloud" service, via msedge-tts)
//      read each stanza with a speed and pitch that fit its mood;
//   3. the MP3 pieces are joined into one file.
// The Edge service is unofficial: if it stops working, Listen falls back to the device voice.

const VOICES = { female: "hi-IN-SwaraNeural", male: "hi-IN-MadhurNeural" }
const MAX_TEXT = 2400

// Hindi in Devanagari, or Roman Hindi (common Hindi / Urdu words)
const HINGLISH = /\b(hai|hain|mera|meri|mere|tera|teri|tere|tum|tumhe|tujhe|mujhe|kya|nahi|nahin|pyaar|pyar|dil|aur|bhi|kabhi|sapne|yaad|yaadon|raat|baat|zindagi|ke|ki|ko|se|mein|yeh|woh|hum|apni|apna|kahani|khayal|aankhon|ishq|mohabbat|dost|accha|acha|kaise|kyun|abhi|sab|bahut)\b/gi
export const isHindi = (text) => /[ऀ-ॿ]/.test(text) || (String(text).match(HINGLISH) || []).length >= 4

// Mood → how to say it (Edge allows speed and pitch, not acted emotion)
const PROSODY = {
  tender: { rate: "-12%", pitch: "-2%" },
  romantic: { rate: "-12%", pitch: "-1%" },
  gentle: { rate: "-10%", pitch: "-2%" },
  soft: { rate: "-12%", pitch: "-3%" },
  longing: { rate: "-16%", pitch: "-4%" },
  wistful: { rate: "-15%", pitch: "-4%" },
  sad: { rate: "-18%", pitch: "-6%" },
  calm: { rate: "-6%", pitch: "0%" },
  serious: { rate: "-6%", pitch: "-3%" },
  hopeful: { rate: "-6%", pitch: "+2%" },
  warm: { rate: "-8%", pitch: "0%" },
  cheerful: { rate: "+2%", pitch: "+4%" },
  playful: { rate: "+3%", pitch: "+5%" },
  excited: { rate: "+6%", pitch: "+6%" },
  dramatic: { rate: "-14%", pitch: "-2%" },
}

// Stanzas (blank-line separated), short enough per request
const stanzas = (text) => text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
  .flatMap((s) => (s.length <= 600 ? [s] : s.match(/[^.!?।\n]+[.!?।\n]*/g).reduce((out, part) => {
    if (out.length && (out[out.length - 1] + part).length <= 600) out[out.length - 1] += part
    else out.push(part)
    return out
  }, [])))

// One AI call: Devanagari text, voice and a mood for each stanza
const prepare = async (parts) => {
  const fallback = { voice: "female", parts: parts.map((text) => ({ text, mood: "warm" })) }
  try {
    const raw = await askGroq([
      { role: "system", content: `You prepare Hindi / Hinglish text to be read aloud by a Hindi text-to-speech voice.
For each numbered part:
- "text": rewrite it in Devanagari script so it is pronounced correctly (Roman Hindi/Urdu → Devanagari with proper spelling, e.g. "zindagi" → "ज़िंदगी", "khayal" → "ख़याल"). Keep line breaks as "\\n". Keep the meaning and every word; do not translate, add or drop anything. English words that are really English can stay in English. Remove emoji.
- "mood": ONE word for how it should feel: tender, romantic, gentle, soft, longing, wistful, sad, calm, serious, hopeful, warm, cheerful, playful, excited or dramatic. Let it move with the text.
Also "voice": "male" if the text is written from a man's point of view or signed by a man, otherwise "female".
Return ONLY JSON: {"voice":"female"|"male","parts":[{"text":"...","mood":"..."}]} with exactly ${parts.length} parts.` },
      { role: "user", content: parts.map((p, i) => `${i + 1}.\n${p}`).join("\n\n") },
    ], { maxTokens: 3000, temperature: 0.2 })
    const parsed = JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] || "{}")
    if (!Array.isArray(parsed.parts) || parsed.parts.length !== parts.length) return fallback
    return {
      voice: parsed.voice === "male" ? "male" : "female",
      parts: parsed.parts.map((p, i) => ({ text: String(p.text || parts[i]).trim() || parts[i], mood: String(p.mood || "warm").toLowerCase().trim() })),
    }
  } catch {
    return fallback
  }
}

// Edge's free service takes plain text only (no pause tags), so lines end with
// punctuation to get natural breaths
const tidy = (text) => text.replace(/\p{Extended_Pictographic}/gu, "")
  .split("\n").map((l) => l.trim()).filter(Boolean)
  .map((l) => (/[.!?।,]$/.test(l) ? l : `${l},`)).join(" ")
  .replace(/,$/, "।")
  .replace(/[<>&]/g, " ")

const synth = (voice, text, prosody) => new Promise((resolve, reject) => {
  const tts = new MsEdgeTTS()
  tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3).then(() => {
    const { audioStream } = tts.toStream(text, prosody)
    const chunks = []
    const timer = setTimeout(() => { tts.close(); reject(new Error("Hindi voice timed out")) }, 30_000)
    audioStream.on("data", (c) => chunks.push(c))
    audioStream.on("close", () => { clearTimeout(timer); tts.close(); chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error("No audio")) })
    audioStream.on("error", (e) => { clearTimeout(timer); tts.close(); reject(e) })
  }, reject)
})

// Text → one MP3 buffer
export const speakHindi = async (text) => {
  const parts = stanzas(String(text).slice(0, MAX_TEXT))
  if (!parts.length) throw new Error("Nothing to read")
  const plan = await prepare(parts)
  const voice = VOICES.female // always a female voice
  const audio = []
  // Two at a time: quick, without hammering the service
  for (let i = 0; i < plan.parts.length; i += 2) {
    const batch = plan.parts.slice(i, i + 2)
    audio.push(...await Promise.all(batch.map((p) => synth(voice, tidy(p.text), PROSODY[p.mood] || PROSODY.warm))))
  }
  return Buffer.concat(audio)
}
