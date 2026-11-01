import bcrypt from "bcryptjs"

// Recovery for a forgotten chat lock code, hidden-chats secret word or app lock PIN:
// the answer to the user's own security question, or (if no question is set) the
// account password. Needs securityAnswer + password selected on `me`.

// Answers ignore capitals and extra spaces: "  New  Delhi " == "new delhi"
export const normalizeAnswer = (a) => String(a || "").trim().toLowerCase().replace(/\s+/g, " ")
export const hashAnswer = (a) => bcrypt.hash(normalizeAnswer(a), 10)
export const questionOk = (q, a) => {
  const question = String(q || "").trim()
  if (question.length < 5 || question.length > 120) return "Pick a question, or write one of 5 to 120 characters"
  if (normalizeAnswer(a).length < 2 || normalizeAnswer(a).length > 60) return "Write an answer of 2 to 60 characters"
  return null
}

const tries = new Map() // userId -> { count, until }
export const proveRecovery = async (me, { answer, password }) => {
  const key = String(me._id)
  const t = tries.get(key)
  if (t?.until > Date.now()) return { ok: false, error: "Too many wrong tries. Wait 15 minutes and try again." }
  let ok = false
  let error
  if (answer !== undefined && answer !== null && me.securityAnswer) {
    ok = await bcrypt.compare(normalizeAnswer(answer), me.securityAnswer)
    error = "That answer isn't right"
  } else if (password) {
    ok = await bcrypt.compare(String(password), me.password)
    error = "Your password isn't right"
  } else {
    return { ok: false, error: me.securityAnswer ? "Answer your security question" : "Enter your account password" }
  }
  if (ok) { tries.delete(key); return { ok: true } }
  const count = (t?.count || 0) + 1
  tries.set(key, count >= 5 ? { count: 0, until: Date.now() + 15 * 60_000 } : { count, until: 0 })
  return { ok: false, error }
}
