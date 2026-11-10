// Encrypts chat text already in the database (saved before encryption was turned on),
// and re-encrypts values written with an old key after a key change.
// Safe to run more than once: encrypted values with the current key are skipped.
//
//   node scripts/encrypt-messages.js --dry-run   # only count what would change
//   node scripts/encrypt-messages.js             # encrypt
//
// Run it with the same MESSAGE_ENCRYPTION_KEY the live server uses.
import "dotenv/config"
import mongoose from "mongoose"
import { checkEncryptionKey, contextFor, decrypt, encrypt, isEncrypted, needsRotation, UNREADABLE } from "../utils/fieldCrypto.js"

const TARGETS = [
  { model: "Message", collection: "messages", fields: ["message", "transcript"] },
  { model: "AiMessage", collection: "aimessages", fields: ["content", "doc.text"] },
  { model: "ScheduledMessage", collection: "scheduledmessages", fields: ["text"] },
]
const dryRun = process.argv.includes("--dry-run")
const get = (o, path) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o)

checkEncryptionKey()
await mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection.db

for (const { model, collection, fields } of TARGETS) {
  let checked = 0, plain = 0, rotated = 0, unreadable = 0
  let ops = []
  const flush = async () => { if (ops.length && !dryRun) await db.collection(collection).bulkWrite(ops, { ordered: false }); ops = [] }
  for await (const doc of db.collection(collection).find({}, { projection: Object.fromEntries(fields.map((f) => [f, 1])) })) {
    checked++
    const set = {}
    for (const f of fields) {
      const v = get(doc, f)
      if (typeof v !== "string" || !v) continue
      const ctx = contextFor(model, f, doc._id)
      if (!isEncrypted(v)) { set[f] = encrypt(v, ctx); plain++ }
      else if (needsRotation(v)) {
        const text = decrypt(v, ctx)
        if (text === UNREADABLE) { unreadable++; continue }
        set[f] = encrypt(text, ctx); rotated++
      }
    }
    // Only replace the value we read, in case it changed meanwhile
    if (Object.keys(set).length) ops.push({ updateOne: { filter: { _id: doc._id, ...Object.fromEntries(Object.keys(set).map((f) => [f, get(doc, f)])) }, update: { $set: set } } })
    if (ops.length >= 500) await flush()
  }
  await flush()
  console.log(`${collection}: ${checked} checked, ${plain} encrypted, ${rotated} re-keyed${unreadable ? `, ${unreadable} unreadable (missing old key)` : ""}${dryRun ? " (dry run, nothing written)" : ""}`)
}
await mongoose.disconnect()
