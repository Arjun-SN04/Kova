// Removes the old `messages` id list from Conversation documents.
// Chats now find their messages by sender / receiver (utils/directChat.js), so the list
// isn't read or written any more; this only frees the space. Safe to run more than once.
//
//   node scripts/drop-conversation-lists.js --dry-run   # only count
//   node scripts/drop-conversation-lists.js
import "dotenv/config"
import mongoose from "mongoose"

const dryRun = process.argv.includes("--dry-run")
await mongoose.connect(process.env.MONGODB_URI)
const conversations = mongoose.connection.db.collection("conversations")
const filter = { messages: { $exists: true } }
const count = await conversations.countDocuments(filter)
if (dryRun) console.log(`${count} conversations still have a messages list`)
else console.log(`Removed the list from ${(await conversations.updateMany(filter, { $unset: { messages: "" } })).modifiedCount} conversations`)
await mongoose.disconnect()
