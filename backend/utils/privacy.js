import User from "../models/user.model.js"

// Privacy settings (Profile → Privacy). Both work both ways, like WhatsApp:
// turning one off hides it from others and also hides it from you.
//   privacy.activity: show when I'm online (presence filtering lives in socket.js)
//   privacy.seen:     seen indicators (the double tick when a message has been read)

const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b)

// True when both people allow seen indicators
export const seenShared = async (a, b) => {
  if (same(a, b)) return true
  const users = await User.find({ _id: { $in: [a, b] } }).select("privacy")
  return users.every((u) => u.privacy?.seen !== false)
}

// Show messages `viewer` sent as not seen yet (used when seen indicators are off)
export const maskSeen = (messages, viewer) => messages.map((m) => {
  // toJSON, not toObject: it also hides what a message must never show (view-once links)
  const o = m.toJSON ? m.toJSON() : m
  return same(o.senderId, viewer) && !same(o.receiverId, viewer) ? { ...o, seen: false } : o
})
