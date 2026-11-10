// Run with: npm test
import { test } from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

// A throwaway key for the tests (set before the module loads it)
const OLD_KEY = crypto.randomBytes(32).toString("base64")
const NEW_KEY = crypto.randomBytes(32).toString("base64")
process.env.MESSAGE_ENCRYPTION_KEY = NEW_KEY
process.env.MESSAGE_ENCRYPTION_OLD_KEYS = OLD_KEY

const { encrypt, decrypt, isEncrypted, needsRotation, encryptedFields, contextFor, UNREADABLE } = await import("../utils/fieldCrypto.js")

test("encrypts and decrypts text", () => {
  const ctx = contextFor("Message", "message", "abc")
  const stored = encrypt("hello 👋", ctx)
  assert.ok(isEncrypted(stored))
  assert.ok(!stored.includes("hello"))
  assert.equal(decrypt(stored, ctx), "hello 👋")
})

test("the same text never looks the same twice", () => {
  const ctx = contextFor("Message", "message", "abc")
  assert.notEqual(encrypt("same", ctx), encrypt("same", ctx))
})

test("ciphertext moved to another record or field doesn't open", () => {
  const stored = encrypt("secret", contextFor("Message", "message", "a"))
  assert.equal(decrypt(stored, contextFor("Message", "message", "b")), UNREADABLE)
  assert.equal(decrypt(stored, contextFor("Message", "transcript", "a")), UNREADABLE)
})

test("tampered ciphertext doesn't open", () => {
  const ctx = contextFor("Message", "message", "a")
  const stored = encrypt("secret", ctx)
  const last = stored.at(-1) === "A" ? "B" : "A"
  assert.equal(decrypt(stored.slice(0, -1) + last, ctx), UNREADABLE)
})

test("plain text from before encryption is returned as it is", () => {
  assert.equal(decrypt("old message", "Message.message:a"), "old message")
  assert.equal(encrypt("", "x"), "")
})

test("values from an old key still open and are flagged for re-encryption", async () => {
  // Encrypt with the old key by loading a second copy of the module with only that key
  process.env.MESSAGE_ENCRYPTION_KEY = OLD_KEY
  process.env.MESSAGE_ENCRYPTION_OLD_KEYS = ""
  const old = await import(`../utils/fieldCrypto.js?old=${Date.now()}`)
  old.checkEncryptionKey() // keys load lazily: load the old one now
  process.env.MESSAGE_ENCRYPTION_KEY = NEW_KEY
  process.env.MESSAGE_ENCRYPTION_OLD_KEYS = OLD_KEY
  const ctx = contextFor("Message", "message", "a")
  const stored = old.encrypt("from last year", ctx)
  assert.equal(decrypt(stored, ctx), "from last year")
  assert.ok(needsRotation(stored))
  assert.ok(!needsRotation(encrypt("new", ctx)))
})

test("the mongoose plugin decrypts loaded documents, but raw reads stay encrypted", () => {
  const schema = new mongoose.Schema({ message: String, transcript: String })
  schema.plugin(encryptedFields, { model: "TestMessage", fields: ["message", "transcript"] })
  const Model = mongoose.model("TestMessage", schema)
  const _id = new mongoose.Types.ObjectId()
  const raw = { _id, message: encrypt("hi there", contextFor("TestMessage", "message", _id)), transcript: null }
  // What a .lean() read or aggregate returns: still encrypted
  assert.ok(isEncrypted(raw.message))
  // What a normal read returns: plain text
  const doc = Model.hydrate({ ...raw })
  assert.equal(doc.message, "hi there")
})

test("updateMany can't write encrypted fields in plain text", async () => {
  const schema = new mongoose.Schema({ text: String })
  schema.plugin(encryptedFields, { model: "TestNote", fields: ["text"] })
  const Model = mongoose.model("TestNote", schema)
  // Runs the hook only: rejected before any database is touched
  await assert.rejects(Model.updateMany({}, { $set: { text: "plain" } }).exec(), /encrypted per record/)
})
