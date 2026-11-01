import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "./models/user.model.js";
import { Message } from "./models/message.model.js";
import { Conversation } from "./models/conversation.model.js";
import { ContactRequest } from "./models/contactRequest.model.js";
import { newInviteToken } from "./utils/username.js";

dotenv.config();

// ── Seed Data ────────────────────────────────────────────────
const USERS = [
  { fullName: "Arjun Sharma",    email: "arjun@nexchat.com",   password: "arjun123" },
  { fullName: "Priya Mehta",     email: "priya@nexchat.com",   password: "priya123" },
  { fullName: "Rahul Verma",     email: "rahul@nexchat.com",   password: "rahul123" },
  { fullName: "Sneha Kapoor",    email: "sneha@nexchat.com",   password: "sneha123" },
  { fullName: "Dev Patel",       email: "dev@nexchat.com",     password: "dev12345" },
  { fullName: "Anjali Singh",    email: "anjali@nexchat.com",  password: "anjali123" },
  { fullName: "Karan Malhotra",  email: "karan@nexchat.com",   password: "karan123" },
  { fullName: "Meera Nair",      email: "meera@nexchat.com",   password: "meera123" },
]

// Conversations: [senderIndex, receiverIndex, messages[]]
const CONVERSATIONS = [
  {
    userA: 0, userB: 1,
    messages: [
      { from: 0, text: "Hey Priya! How's it going? 👋" },
      { from: 1, text: "Hey Arjun! All good, just finished a project. You?" },
      { from: 0, text: "Same here, wrapped up the NexChat app deployment today 🚀" },
      { from: 1, text: "Wow that's awesome! Is it live?" },
      { from: 0, text: "Yep! Running on Vercel + Render. Works like a charm ✅" },
      { from: 1, text: "Send me the link, I wanna check it out!" },
      { from: 0, text: "kova-im.vercel.app — try logging in!" },
      { from: 1, text: "Looks super clean 😍 Love the dark mode" },
    ]
  },
  {
    userA: 0, userB: 2,
    messages: [
      { from: 2, text: "Bro are you free this evening?" },
      { from: 0, text: "Yeah! What's up Rahul?" },
      { from: 2, text: "Wanna do a code review session? Working on a Node.js API" },
      { from: 0, text: "Sure, drop the repo link here" },
      { from: 2, text: "github.com/rahul/api-project — main branch" },
      { from: 0, text: "On it! Give me 20 mins" },
      { from: 2, text: "No rush, thanks man 🙏" },
    ]
  },
  {
    userA: 1, userB: 3,
    messages: [
      { from: 1, text: "Sneha did you see the design mockups I sent?" },
      { from: 3, text: "Just opened them, they look amazing! 🎨" },
      { from: 1, text: "Thanks! I was going for a minimal vibe" },
      { from: 3, text: "The color palette is 🔥 — indigo and slate go so well together" },
      { from: 1, text: "Exactly what I was thinking. Tailwind makes it so easy" },
      { from: 3, text: "Are we presenting this to the team tomorrow?" },
      { from: 1, text: "Yes, 10am standup. Be there! ⏰" },
      { from: 3, text: "I'll be ready 💪" },
    ]
  },
  {
    userA: 2, userB: 4,
    messages: [
      { from: 4, text: "Dev here! Quick question about the auth flow" },
      { from: 2, text: "Go ahead" },
      { from: 4, text: "Are we using httpOnly cookies or localStorage for JWT?" },
      { from: 2, text: "httpOnly cookies — much safer against XSS attacks" },
      { from: 4, text: "Makes sense. And for refresh tokens?" },
      { from: 2, text: "Not implemented yet, but it's on the roadmap" },
      { from: 4, text: "Got it, I'll add it as a GitHub issue" },
      { from: 2, text: "Perfect 👍" },
    ]
  },
  {
    userA: 3, userB: 5,
    messages: [
      { from: 3, text: "Anjali! Long time no talk 😊" },
      { from: 5, text: "I know! Been super busy with the new role" },
      { from: 3, text: "Oh nice, how's it going?" },
      { from: 5, text: "Loving it! Full-stack work, React + Express, right up my alley" },
      { from: 3, text: "That's amazing! We should catch up properly soon" },
      { from: 5, text: "Definitely! Coffee this weekend? ☕" },
      { from: 3, text: "Saturday works for me!" },
      { from: 5, text: "Saturday it is 🎉" },
    ]
  },
  {
    userA: 4, userB: 6,
    messages: [
      { from: 6, text: "Dev, quick ping — the socket reconnection is flaky on mobile" },
      { from: 4, text: "I saw that too. Probably needs exponential backoff" },
      { from: 6, text: "Yeah I was thinking the same. Socket.io has built-in options for that" },
      { from: 4, text: "True, let me check the docs and push a fix tonight" },
      { from: 6, text: "Appreciate it! Also the typing indicator would be a great next feature" },
      { from: 4, text: "100% adding that next sprint" },
      { from: 6, text: "Can't wait to see it in action ⚡" },
    ]
  },
  {
    userA: 5, userB: 7,
    messages: [
      { from: 5, text: "Meera, did you finish the MongoDB aggregation for the dashboard?" },
      { from: 7, text: "Almost! Just debugging a $lookup stage issue" },
      { from: 5, text: "Nested lookups can be tricky 😅 Need help?" },
      { from: 7, text: "Please! My pipeline keeps returning empty arrays" },
      { from: 5, text: "Share the query and I'll take a look" },
      { from: 7, text: "Sending in a sec... also hi 😄" },
      { from: 5, text: "Haha hi! Send it over 😂" },
      { from: 7, text: "OK here it is — [paste query]" },
    ]
  },
  {
    userA: 1, userB: 6,
    messages: [
      { from: 1, text: "Karan are you joining the team call at 3?" },
      { from: 6, text: "Yes! Just finishing up a PR review" },
      { from: 1, text: "No worries, we're starting 5 mins late anyway" },
      { from: 6, text: "Perfect. Should I screen share my progress?" },
      { from: 1, text: "That would be great actually!" },
      { from: 6, text: "Done, see you there 🤝" },
    ]
  },
]

// ── Main seed function ────────────────────────────────────────
async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log("✅ Connected to MongoDB")

    // 1. Clear all collections
    await User.deleteMany({})
    await Message.deleteMany({})
    await Conversation.deleteMany({})
    await ContactRequest.deleteMany({})
    console.log("🗑️  Cleared all existing data")

    // 2. Create users with hashed passwords
    const hashedUsers = await Promise.all(
      USERS.map(async (u) => ({
        fullName: u.fullName,
        email: u.email,
        username: u.email.split("@")[0],
        inviteToken: newInviteToken(),
        password: await bcrypt.hash(u.password, 10),
      }))
    )
    const createdUsers = await User.insertMany(hashedUsers)
    console.log(`👥 Created ${createdUsers.length} users`)

    // 3. Create conversations + messages
    let totalMessages = 0
    for (const conv of CONVERSATIONS) {
      const userA = createdUsers[conv.userA]
      const userB = createdUsers[conv.userB]

      // Create all messages for this conversation
      const createdMessages = await Promise.all(
        conv.messages.map((m) =>
          Message.create({
            senderId:   createdUsers[m.from]._id,
            receiverId: m.from === conv.userA ? userB._id : userA._id,
            message:    m.text,
            edited:     false,
          })
        )
      )

      // Create conversation linking both users and messages
      // People who chat are contacts
      await User.updateOne({ _id: userA._id }, { $addToSet: { contacts: userB._id } })
      await User.updateOne({ _id: userB._id }, { $addToSet: { contacts: userA._id } })

      await Conversation.create({
        members:  [userA._id, userB._id],
        messages: createdMessages.map((m) => m._id),
      })

      totalMessages += createdMessages.length
    }

    console.log(`💬 Created ${CONVERSATIONS.length} conversations with ${totalMessages} messages`)
    console.log("\n─────────────────────────────────────────")
    console.log("🎉 Seed complete! Test accounts:")
    console.log("─────────────────────────────────────────")
    USERS.forEach(u => {
      console.log(`  📧 ${u.email.padEnd(25)} 🔑 ${u.password}`)
    })
    console.log("─────────────────────────────────────────\n")

  } catch (err) {
    console.error("❌ Seed failed:", err)
  } finally {
    await mongoose.disconnect()
    console.log("🔌 Disconnected from MongoDB")
  }
}

seed()
