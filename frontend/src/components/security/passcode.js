import { useState } from 'react'

// ── Passcodes: digits only, or letters and numbers ──
export const LIMITS = { numeric: [4, 10], alnum: [4, 16] }
export const cleanCode = (v, kind) => (kind === 'numeric' ? v.replace(/\D/g, '') : v.replace(/[^A-Za-z0-9]/g, '')).slice(0, LIMITS[kind][1])
export const codeOk = (v, kind) => v.length >= LIMITS[kind][0] && v.length <= LIMITS[kind][1]
export const codeHint = (kind) => (kind === 'numeric' ? '4 to 10 digits' : '4 to 16 letters or numbers')

// New code + confirm, with the type switch. Pass the result to <NewCodeFields state={…} />.
export const useNewCode = (initialKind = 'numeric') => {
  const [kind, setKindRaw] = useState(initialKind)
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')
  const setKind = (k) => { setKindRaw(k); setCode(''); setAgain('') }
  const valid = codeOk(code, kind) && code === again
  const reset = () => { setCode(''); setAgain('') }
  return { kind, setKind, code, setCode, again, setAgain, valid, reset }
}

// ── Security question ──
export const QUESTIONS = [
  'What was the name of your first pet?',
  'In which city were you born?',
  'What was the name of your first school?',
  'What is your childhood best friend’s name?',
  'What was the first concert or film you saw in a cinema?',
  'Write my own question',
]
export const useQuestion = () => {
  const [value, setValue] = useState({ preset: QUESTIONS[0], custom: '', answer: '' })
  const own = value.preset === QUESTIONS[QUESTIONS.length - 1]
  const question = (own ? value.custom : value.preset).trim()
  const valid = question.length >= 5 && value.answer.trim().length >= 2
  return { value, setValue, valid, payload: { question, answer: value.answer } }
}

// Is the "forgot it" proof filled in? (answer to the question, or account password)
export const recoveryReady = (question, v) => (question ? (v.answer || '').trim().length >= 2 : (v.password || '').length >= 1)
