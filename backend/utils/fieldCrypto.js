// Encryption at rest for chat text (direct and group messages, voice-note transcripts,
// Nexa chats, scheduled messages). Only this server, holding MESSAGE_ENCRYPTION_KEY,
// can read what is stored in MongoDB.
//
// - AES-256-GCM: authenticated, so a changed or corrupted value fails to open instead
//   of turning into garbage.
// - A new random 96-bit IV for every value, so the same text never looks the same twice.
// - Each value is tied to its record and field (GCM "additional data"): ciphertext copied
//   onto another message or field won't decrypt.
// - Stored as  enc:v1:<key id>:<iv>:<tag>:<ciphertext>  (base64url). The key id lets you
//   rotate keys: put the new key in MESSAGE_ENCRYPTION_KEY and the old one in
//   MESSAGE_ENCRYPTION_OLD_KEYS (comma-separated) until scripts/encrypt-messages.js
//   has re-encrypted everything.
//
// Make a key:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Lose the key and the stored messages can't be read by anyone, so back it up.

import crypto from "node:crypto"
import mongoose from "mongoose"

const PREFIX = "enc:v1:"
const ALGO = "aes-256-gcm"

const parseKey = (text, name) => {
  const raw = String(text || "").trim()
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64")
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64 or hex (see utils/fieldCrypto.js)`)
  const id = crypto.createHash("sha256").update(key).digest("hex").slice(0, 8)
  return { id, key }
}

let keys = null // { current, byId }
const loadKeys = () => {
  if (keys) return keys
  if (!process.env.MESSAGE_ENCRYPTION_KEY) {
    throw new Error("MESSAGE_ENCRYPTION_KEY is not set. Chats are stored encrypted, so the server can't start without it (see utils/fieldCrypto.js).")
  }
  const current = parseKey(process.env.MESSAGE_ENCRYPTION_KEY, "MESSAGE_ENCRYPTION_KEY")
  const old = String(process.env.MESSAGE_ENCRYPTION_OLD_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean)
    .map((k) => parseKey(k, "MESSAGE_ENCRYPTION_OLD_KEYS"))
  keys = { current, byId: new Map([current, ...old].map((k) => [k.id, k.key])) }
  return keys
}

// Checked when the server starts, so a missing or bad key stops it straight away
export const checkEncryptionKey = () => { loadKeys() }

export const isEncrypted = (value) => typeof value === "string" && value.startsWith(PREFIX)
const b64 = (buf) => buf.toString("base64url")

// context ties the value to one record + field, e.g. "Message.message:<id>"
export const encrypt = (plain, context) => {
  if (typeof plain !== "string" || plain === "" || isEncrypted(plain)) return plain
  const { current } = loadKeys()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, current.key, iv)
  cipher.setAAD(Buffer.from(context))
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return `${PREFIX}${current.id}:${b64(iv)}:${b64(cipher.getAuthTag())}:${b64(body)}`
}

export const UNREADABLE = "🔒 This message can't be decrypted"

// Text saved before encryption was turned on is returned as it is
export const decrypt = (value, context) => {
  if (!isEncrypted(value)) return value
  const [kid, iv, tag, body] = value.slice(PREFIX.length).split(":")
  const key = loadKeys().byId.get(kid)
  if (!key) { warnOnce(`no key with id ${kid}`); return UNREADABLE }
  try {
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, "base64url"))
    decipher.setAAD(Buffer.from(context))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    warnOnce("a value failed its integrity check (wrong key, or the data was changed)")
    return UNREADABLE
  }
}

const warned = new Set()
const warnOnce = (msg) => { if (!warned.has(msg)) { warned.add(msg); console.warn(`fieldCrypto: ${msg}`) } }

// Whether a value was written with an old key (re-encrypt it with the current one)
export const needsRotation = (value) => isEncrypted(value) && value.slice(PREFIX.length).split(":")[0] !== loadKeys().current.id

// ── Mongoose plugin ────────────────────────────────────────────
// schema.plugin(encryptedFields, { model: "Message", fields: ["message", "transcript"] })
// Fields are encrypted on save / insertMany and decrypted when documents load, so the rest
// of the code reads and writes plain text. Raw reads (.lean(), aggregate) skip this: wrap
// them with Model.hydrate(), or use decryptDoc().
const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj)
const setPath = (obj, path, value) => {
  const parts = path.split(".")
  const last = parts.pop()
  const parent = parts.reduce((o, k) => (o == null ? undefined : o[k]), obj)
  if (parent != null && typeof parent === "object") parent[last] = value
}

export const contextFor = (model, field, id) => `${model}.${field}:${String(id)}`

// Plain objects (lean reads, aggregate results)
export const decryptDoc = (model, fields, obj) => {
  if (!obj?._id) return obj
  for (const f of fields) {
    const v = getPath(obj, f)
    if (isEncrypted(v)) setPath(obj, f, decrypt(v, contextFor(model, f, obj._id)))
  }
  return obj
}

export const encryptedFields = (schema, { model, fields }) => {
  // Works on the raw stored values, so change tracking isn't touched
  const encryptRaw = (raw) => {
    for (const f of fields) {
      const v = getPath(raw, f)
      if (typeof v === "string" && v && !isEncrypted(v)) setPath(raw, f, encrypt(v, contextFor(model, f, raw._id)))
    }
  }
  const decryptRaw = (raw) => decryptDoc(model, fields, raw)

  schema.pre("save", function () {
    // New documents are written whole; existing ones only send changed fields
    for (const f of fields) {
      if (!this.isNew && !this.isModified(f)) continue
      const v = this.get(f)
      if (typeof v === "string" && v && !isEncrypted(v)) this.set(f, encrypt(v, contextFor(model, f, this._id)))
    }
  })
  // Back to plain text in memory, for the code (and sockets) that use the saved document
  schema.post("save", function () { decryptRaw(this._doc) })
  schema.post("init", function () { decryptRaw(this._doc) })

  schema.pre("insertMany", function (docs) {
    for (const d of Array.isArray(docs) ? docs : [docs]) {
      // Plain objects get their id now, since it's part of the encryption
      if (!d._doc && !d._id) d._id = new mongoose.Types.ObjectId()
      encryptRaw(d._doc || d)
    }
  })
  schema.post("insertMany", function (docs) {
    for (const d of Array.isArray(docs) ? docs : [docs]) decryptRaw(d?._doc || d)
  })

  // Query updates: only allowed for one record by _id (the id is part of the encryption)
  schema.pre(["updateOne", "findOneAndUpdate", "replaceOne"], function () {
    const update = this.getUpdate() || {}
    const targets = [update, update.$set, update.$setOnInsert].filter(Boolean)
    const touched = fields.filter((f) => targets.some((t) => typeof t[f] === "string" && t[f]))
    if (!touched.length) return
    const id = this.getFilter()?._id
    const single = typeof id === "string" || id instanceof mongoose.Types.ObjectId
    if (!single) {
      throw new Error(`${model}: update ${touched.join(", ")} through a loaded document (or filter by _id), so it can be encrypted`)
    }
    for (const t of targets) for (const f of touched) if (typeof t[f] === "string" && t[f]) t[f] = encrypt(t[f], contextFor(model, f, id))
  })
  schema.pre("updateMany", function () {
    const update = this.getUpdate() || {}
    const targets = [update, update.$set, update.$setOnInsert].filter(Boolean)
    if (fields.some((f) => targets.some((t) => typeof t[f] === "string" && t[f]))) {
      throw new Error(`${model}: can't set ${fields.join(", ")} with updateMany; they're encrypted per record`)
    }
  })
}
