import mongoose from "mongoose"

// A user's connected Google account (Calendar + Tasks) and their Nexa reminder settings
const googleAccountSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  email: { type: String, default: "" },
  // Encrypted (utils/google.js). Never sent to the browser.
  refreshToken: { type: String, required: true },
  accessToken: { type: String, default: "" },
  accessExpires: { type: Date, default: null },
  scopes: { type: [String], default: [] },
  timeZone: { type: String, default: "UTC" },

  // Morning brief from Nexa: today's meetings and tasks
  dailyBrief: { type: Boolean, default: true },
  briefTime: { type: String, default: "08:00" }, // HH:MM in timeZone
  lastBriefDate: { type: String, default: "" },   // YYYY-MM-DD (local) of the last brief sent

  // Gmail (optional): unread important mail in the morning brief
  briefEmails: { type: Boolean, default: true },

  // A message from Nexa shortly before each meeting
  meetReminders: { type: Boolean, default: true },
  reminderMinutes: { type: Number, default: 10 },
  reminded: { type: [String], default: [] },      // "eventId@start" already reminded (last 200)
  // Snoozed reminders: Nexa reminds again at `at`
  snoozes: {
    type: [{ _id: false, id: String, at: Date, event: mongoose.Schema.Types.Mixed }],
    default: [],
  },

  // Set when Google stops accepting the token (revoked access): the user must reconnect
  broken: { type: Boolean, default: false },
}, { timestamps: true })

export const GoogleAccount = mongoose.model("GoogleAccount", googleAccountSchema)
