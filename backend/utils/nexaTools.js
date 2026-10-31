import { randomUUID } from "crypto"
import User from "../models/user.model.js"
import { Group } from "../models/group.model.js"
import { ScheduledMessage } from "../models/scheduledMessage.model.js"
import { deliverText } from "./deliver.js"
import { emitToUsers } from "./notify.js"
import { readChat } from "./chatAccess.js"
import { addTask, completeTask, createDraft, createEvent, deleteEvent, getAccount, hasGmail, listEvents, listMail, listTasks, readMail } from "./google.js"
import { MAX_SNOOZE_MIN, dayBounds, refreshUpcoming, snoozeReminder } from "./agenda.js"
import { AiMessage } from "../models/aiMessage.model.js"
import { createPollMessage } from "../controller/messageExtras.controller.js"

// What Nexa can do. The server checks every action against the user's own permissions.
export const NEXA_TOOLS = [
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Send a text message right now from the user to one of their contacts, groups, or themself ('me'). Only when the user clearly asks to send something.",
      parameters: {
        type: "object",
        properties: {
          recipient_id: { type: "string", description: "id from the contacts/groups list, or 'me'" },
          text: { type: "string", description: "The exact message to send" },
        },
        required: ["recipient_id", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_message",
      description: "Send a message later to a contact, group or 'me' (a reminder). Can repeat.",
      parameters: {
        type: "object",
        properties: {
          recipient_id: { type: "string", description: "id from the contacts/groups list, or 'me'" },
          text: { type: "string", description: "The message to send" },
          send_at: { type: "string", description: "First send time, ISO 8601 with offset" },
          repeat_every_minutes: { type: "integer", description: "Repeat every N minutes (1440 = daily). Omit for once." },
          repeat_until: { type: "string", description: "Optional: stop after this ISO time" },
          repeat_times: { type: "integer", description: "Optional: total times (default 30)" },
        },
        required: ["recipient_id", "text", "send_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_scheduled_messages",
      description: "List the user's scheduled messages that haven't been sent yet.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_scheduled_message",
      description: "Cancel one of the user's scheduled messages (get ids from list_scheduled_messages).",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_messages",
      description: "Read the latest messages in one of the user's chats or groups, e.g. to summarize it or catch them up.",
      parameters: {
        type: "object",
        properties: {
          recipient_id: { type: "string", description: "id from the contacts/groups list, or 'me'" },
          count: { type: "integer", description: "How many recent messages (max 60)" },
        },
        required: ["recipient_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_poll",
      description: "Post a poll in a group or chat, e.g. 'make a poll in Team: lunch at 1 or 2?'",
      parameters: {
        type: "object",
        properties: {
          recipient_id: { type: "string", description: "id of the group (or contact) from the list" },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" }, description: "2 to 12 answer options" },
          multiple: { type: "boolean", description: "Let people pick more than one option" },
        },
        required: ["recipient_id", "question", "options"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Create a picture from a description.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Vivid English description: subject, setting, style, lighting" },
          shape: { type: "string", enum: ["square", "portrait", "landscape"], description: "Image shape. Default square." },
        },
        required: ["prompt"],
      },
    },
  },
]

export const formatWhen = (date, timeZone) =>
  new Date(date).toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

// Google Calendar + Tasks tools: only offered when the user has connected Google
const when = "ISO 8601 with offset"
export const CALENDAR_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_calendar_events",
      description: "List events/meetings on the user's Google Calendar between two times (default: today).",
      parameters: { type: "object", properties: { from: { type: "string", description: when }, to: { type: "string", description: when } } },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Add an event or reminder to Google Calendar.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          start: { type: "string", description: when },
          end: { type: "string", description: "Optional, default start + 30 min" },
          add_meet: { type: "boolean", description: "Add a Google Meet link" },
          attendee_emails: { type: "array", items: { type: "string" }, description: "Only emails the user gave" },
          description: { type: "string" },
          is_reminder: { type: "boolean", description: "A personal reminder, not a meeting" },
          repeat: { type: "string", enum: ["none", "daily", "weekdays", "weekly", "monthly"] },
          repeat_count: { type: "integer" },
          repeat_until: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["title", "start"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_calendar_event",
      description: "Delete an event from the user's calendar (get its id from get_calendar_events first). Only when the user clearly asks.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "snooze_reminder",
      description: "Remind again later about a meeting reminder Nexa sent.",
      parameters: {
        type: "object",
        properties: {
          minutes: { type: "integer", description: "Remind again after this many minutes (1-1440)" },
          until: { type: "string", description: `Or remind again at this time: ${when}` },
          title: { type: "string", description: "Which meeting, if the user named one (default: the latest reminder)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tasks",
      description: "List the user's open Google Tasks (with due dates).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_task",
      description: "Add a task to the user's Google Tasks.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" }, due: { type: "string", description: "Due date YYYY-MM-DD (optional)" }, notes: { type: "string" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark one of the user's Google Tasks as done (get its id from get_tasks first).",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
]

// Gmail tools: only when the user connected Gmail
export const GMAIL_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_emails",
      description: "List the user's emails. Uses Gmail search syntax, e.g. 'is:unread category:primary', 'from:priya', 'subject:invoice newer_than:7d'.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Gmail search. Default: unread in Primary" }, max: { type: "integer", description: "Up to 15" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "read_email",
      description: "Read one email (id from search_emails) to summarize it or reply.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description: "Save an email DRAFT in the user's Gmail (never sends). Either a reply (reply_to_id from search/read) or a new email (to + subject).",
      parameters: {
        type: "object",
        properties: {
          reply_to_id: { type: "string", description: "Email id to reply to (same thread)" },
          to: { type: "string", description: "For a new email: the address the user gave" },
          subject: { type: "string" },
          body: { type: "string", description: "The email text, ready to send, signed with the user's first name" },
        },
        required: ["body"],
      },
    },
  },
]

// Everyone and every group the user can message, for the prompt and for checking tool calls
export const loadNexaContext = async (user, timeZone) => {
  const me = await User.findById(user._id).populate("contacts", "fullName username")
  const groups = await Group.find({ members: user._id }).select("name announcement adminsOnly admins community").populate("community", "name")
  const people = new Map(me.contacts.map((c) => [String(c._id), c]))
  const groupMap = new Map(groups.map((g) => [String(g._id), g]))
  const google = await getAccount(user._id).catch(() => null)
  return { user, timeZone, people, groups: groupMap, google }
}

export const describeContext = (ctx) => {
  const people = [...ctx.people.values()].slice(0, 150).map((c) => `- ${c.fullName} (@${c.username}) id=${c._id}`)
  const groups = [...ctx.groups.values()].slice(0, 100).map((g) =>
    `- ${g.name}${g.community ? ` (in community ${g.community.name})` : ""}${g.announcement ? " [announcements]" : ""} id=${g._id}`)
  return `Contacts:\n${people.join("\n") || "(none)"}\nGroups:\n${groups.join("\n") || "(none)"}\nThe user themself: id=me`
}

// recipient_id -> { receiverId } | { groupId } plus a display name
const resolve = (ctx, id) => {
  const key = String(id || "").trim()
  if (["me", "self", String(ctx.user._id)].includes(key)) return { receiverId: ctx.user._id, name: "you (Message yourself)", chatId: String(ctx.user._id) }
  if (ctx.people.has(key)) return { receiverId: key, name: ctx.people.get(key).fullName, chatId: key }
  if (ctx.groups.has(key)) return { groupId: key, name: ctx.groups.get(key).name, chatId: key, isGroup: true }
  return null
}


// Run one tool call. Returns { result } for the model, and an optional `action` card for the chat.
export const runNexaTool = async (name, args, ctx) => {
  const me = ctx.user._id
  switch (name) {
    case "send_message": {
      const to = resolve(ctx, args.recipient_id)
      if (!to) return { result: { error: "Unknown recipient. Use an id from the list." } }
      try {
        const msg = await deliverText({ senderId: me, receiverId: to.receiverId, groupId: to.groupId, text: args.text })
        return {
          result: { ok: true, sent_to: to.name },
          action: { type: "sent", to: to.name, chatId: to.chatId, isGroup: !!to.isGroup, text: msg.message, messageId: String(msg._id) },
        }
      } catch (err) {
        return { result: { error: err.message }, action: { type: "failed", to: to.name, text: args.text, error: err.message } }
      }
    }

    case "schedule_message": {
      const to = resolve(ctx, args.recipient_id)
      if (!to) return { result: { error: "Unknown recipient. Use an id from the list." } }
      const text = String(args.text || "").trim()
      const sendAt = new Date(args.send_at)
      if (!text) return { result: { error: "The message is empty" } }
      if (Number.isNaN(sendAt.getTime())) return { result: { error: "Invalid time. Use ISO 8601 with the UTC offset." } }
      if (sendAt.getTime() < Date.now() + 15_000) return { result: { error: "That time has already passed. Ask the user for a future time." } }
      if (sendAt.getTime() > Date.now() + 366 * 24 * 3600_000) return { result: { error: "Messages can be scheduled up to a year ahead." } }
      if (to.groupId) {
        const g = ctx.groups.get(String(to.groupId))
        if ((g.announcement || g.adminsOnly) && !g.admins.some((a) => String(a) === String(me))) return { result: { error: "Only admins can send messages in that group" } }
      }
      // Repeating reminders/messages
      let repeat = null
      const every = Math.round(Number(args.repeat_every_minutes) || 0)
      if (every) {
        const toSelf = String(to.receiverId) === String(me)
        const minEvery = toSelf ? 1 : 60 // don't let anyone spam other people
        if (every < minEvery) return { result: { error: toSelf ? "Repeat at least every minute" : "Messages to other people can repeat at most once an hour" } }
        if (every > 30 * 24 * 60) return { result: { error: "Repeat at most every 30 days" } }
        const until = args.repeat_until && !Number.isNaN(new Date(args.repeat_until).getTime()) ? new Date(args.repeat_until) : null
        if (until && until <= sendAt) return { result: { error: "repeat_until must be after the first send" } }
        const fromUntil = until ? Math.floor((until - sendAt) / (every * 60_000)) + 1 : Infinity
        const times = Math.min(Math.round(Number(args.repeat_times) || (until ? fromUntil : 30)), fromUntil, 500)
        repeat = { everyMinutes: every, until, left: times, sent: 0 }
      }
      const job = await ScheduledMessage.create({ sender: me, receiver: to.receiverId || null, group: to.groupId || null, text: text.slice(0, 4000), sendAt, repeat })
      emitToUsers([me], "scheduledUpdated", { id: String(job._id), status: "pending" })
      const last = repeat ? new Date(sendAt.getTime() + (repeat.left - 1) * every * 60_000) : null
      return {
        result: {
          ok: true, id: String(job._id), to: to.name, when: formatWhen(sendAt, ctx.timeZone),
          ...(repeat ? { repeats: `every ${every} min, ${repeat.left} times`, lastOne: formatWhen(last, ctx.timeZone), howToStop: "the user can say 'stop the reminder' or press Cancel" } : {}),
        },
        action: { type: "scheduled", id: String(job._id), to: to.name, chatId: to.chatId, isGroup: !!to.isGroup, text, sendAt: sendAt.toISOString(), ...(repeat ? { repeatEvery: every, repeatTimes: repeat.left, lastAt: last.toISOString() } : {}) },
      }
    }

    case "list_scheduled_messages": {
      const jobs = await ScheduledMessage.find({ sender: me, status: "pending" }).sort({ sendAt: 1 }).limit(30)
      return {
        result: {
          scheduled: jobs.map((j) => ({
            id: String(j._id),
            to: j.group ? ctx.groups.get(String(j.group))?.name || "a group" : String(j.receiver) === String(me) ? "you" : ctx.people.get(String(j.receiver))?.fullName || "a contact",
            text: j.text,
            when: formatWhen(j.sendAt, ctx.timeZone),
            ...(j.repeat?.everyMinutes ? { repeats: `every ${j.repeat.everyMinutes} min, ${j.repeat.left} left` } : {}),
          })),
        },
      }
    }

    case "cancel_scheduled_message": {
      const job = await ScheduledMessage.findOneAndUpdate(
        { _id: String(args.id || ""), sender: me, status: "pending" },
        { $set: { status: "cancelled" } },
        { new: true },
      ).catch(() => null)
      if (!job) return { result: { error: "No pending scheduled message with that id" } }
      emitToUsers([me], "scheduledUpdated", { id: String(job._id), status: "cancelled" })
      const to = job.group ? ctx.groups.get(String(job.group))?.name : String(job.receiver) === String(me) ? "you" : ctx.people.get(String(job.receiver))?.fullName
      return { result: { ok: true }, action: { type: "cancelled", id: String(job._id), to, text: job.text } }
    }

    case "create_poll": {
      const to = resolve(ctx, args.recipient_id)
      if (!to) return { result: { error: "Unknown chat. Use an id from the list." } }
      try {
        const msg = await createPollMessage(ctx.user, { chatId: to.chatId, isGroup: !!to.isGroup, question: args.question, options: args.options, multiple: args.multiple })
        return { result: { ok: true, to: to.name }, action: { type: "sent", to: to.name, chatId: to.chatId, isGroup: !!to.isGroup, text: `Poll: ${msg.poll.question} (${msg.poll.options.map((o) => o.text).join(" / ")})`, messageId: String(msg._id) } }
      } catch (err) {
        return { result: { error: err.message } }
      }
    }

    case "get_recent_messages": {
      const to = resolve(ctx, args.recipient_id)
      if (!to) return { result: { error: "Unknown chat. Use an id from the list." } }
      const chat = await readChat(me, to.chatId, { count: Number(args.count) || 30, timeZone: ctx.timeZone })
      if (!chat) return { result: { error: "You can't read that chat" } }
      return { result: { chat: to.name, messages: chat.lines } }
    }

    // The chat card then asks POST /api/ai/messages/:id/image to draw it (utils/imageGen.js)
    case "generate_image": {
      const prompt = String(args.prompt || "").trim().slice(0, 1000)
      if (!prompt) return { result: { error: "Describe the image" } }
      const shape = ["square", "portrait", "landscape"].includes(args.shape) ? args.shape : "square"
      return {
        result: { ok: true, note: "The image is being drawn in the chat now. Reply with one short line, don't describe the prompt." },
        action: { type: "image", id: randomUUID(), prompt, shape },
      }
    }

    // ── Google Calendar / Tasks ──
    case "get_calendar_events":
    case "create_calendar_event":
    case "delete_calendar_event":
    case "search_emails":
    case "read_email":
    case "draft_email": {
      if (!ctx.google || !hasGmail(ctx.google)) return { result: { error: "Gmail isn't connected. Tell the user to open the calendar button in the Nexa chat and connect Gmail." } }
      try {
        return await runGmailTool(name, args, ctx)
      } catch (err) {
        return { result: { error: err.message } }
      }
    }
    case "snooze_reminder":
    case "get_tasks":
    case "add_task":
    case "complete_task": {
      if (!ctx.google) return { result: { error: "Google Calendar isn't connected. Tell the user to tap the calendar button at the top of the Nexa chat." } }
      try {
        return await runCalendarTool(name, args, ctx)
      } catch (err) {
        return { result: { error: err.message } }
      }
    }

    default:
      return { result: { error: `Unknown tool ${name}` } }
  }
}

const validDate = (v) => v && !Number.isNaN(new Date(v).getTime())

const runCalendarTool = async (name, args, ctx) => {
  const g = ctx.google
  const tz = ctx.timeZone
  switch (name) {
    case "get_calendar_events": {
      const today = dayBounds(tz)
      const from = validDate(args.from) ? new Date(args.from) : today.start
      const to = validDate(args.to) ? new Date(args.to) : (validDate(args.from) ? dayBounds(tz, from).end : today.end)
      const events = await listEvents(g, from, to, 30)
      return { result: { from: formatWhen(from, tz), to: formatWhen(to, tz), events: events.map((e) => ({ id: e.id, title: e.title, start: e.allDay ? e.start : formatWhen(e.start, tz), end: e.allDay ? e.end : formatWhen(e.end, tz), allDay: e.allDay, hasMeet: !!e.meetLink, location: e.location, with: e.attendees })) } }
    }
    case "create_calendar_event": {
      if (!validDate(args.start)) return { result: { error: "Give the start time as ISO 8601 with the UTC offset" } }
      const start = new Date(args.start)
      const reminder = !!args.is_reminder
      const end = validDate(args.end) && new Date(args.end) > start ? new Date(args.end) : new Date(start.getTime() + (reminder ? 15 : 30) * 60_000)
      const freq = { daily: "FREQ=DAILY", weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", weekly: "FREQ=WEEKLY", monthly: "FREQ=MONTHLY" }[args.repeat]
      const count = Math.min(Math.round(Number(args.repeat_count) || 0), 730)
      const until = /^\d{4}-\d{2}-\d{2}$/.test(args.repeat_until || "") ? `;UNTIL=${args.repeat_until.replace(/-/g, "")}T235959Z` : ""
      const recurrence = freq ? [`RRULE:${freq}${count ? `;COUNT=${count}` : until}`] : undefined
      const event = await createEvent(g, { title: String(args.title || "Meeting").slice(0, 200), start, end, description: args.description, attendees: Array.isArray(args.attendee_emails) ? args.attendee_emails : [], meet: !!args.add_meet, timeZone: tz, recurrence, reminder })
      refreshUpcoming(ctx.user._id)
      const repeatLabel = freq ? { daily: "every day", weekdays: "every weekday", weekly: "every week", monthly: "every month" }[args.repeat] : null
      return { result: { ok: true, id: event.id, when: formatWhen(event.start, tz), meetLink: event.meetLink, repeats: repeatLabel }, action: { type: "event", created: true, isReminder: reminder || undefined, repeats: repeatLabel || undefined, ...event } }
    }
    case "delete_calendar_event": {
      await deleteEvent(g, String(args.id || ""))
      refreshUpcoming(ctx.user._id)
      return { result: { ok: true } }
    }
    case "snooze_reminder": {
      const at = validDate(args.until) ? new Date(args.until) : new Date(Date.now() + Math.round(Number(args.minutes) || 10) * 60_000)
      const minutes = (at - Date.now()) / 60_000
      if (minutes < 1 || minutes > MAX_SNOOZE_MIN) return { result: { error: "Snooze must be between 1 minute and 24 hours from now" } }
      // The latest reminder from the last 12 hours (matching the title, if given)
      const recent = await AiMessage.find({ user: ctx.user._id, role: "assistant", "actions.reminder": true, createdAt: { $gt: new Date(Date.now() - 12 * 3600_000) } }).sort({ createdAt: -1 }).limit(20)
      const want = String(args.title || "").toLowerCase().trim()
      const message = recent.find((m) => !want || m.actions.some((a) => a.reminder && a.title?.toLowerCase().includes(want))) || (want ? null : recent[0])
      if (!message) return { result: { error: want ? `No recent reminder for "${args.title}"` : "There's no recent reminder to snooze" } }
      const action = await snoozeReminder(g, message, at)
      return { result: { ok: true, event: action.title, remindAt: formatWhen(at, tz) }, action: { type: "snoozed", title: action.title, until: at.toISOString() } }
    }
    case "get_tasks": {
      const tasks = await listTasks(g)
      return { result: { today: dayBounds(tz).ymd, tasks: tasks.map(({ id, title, due, notes }) => ({ id, title, due, notes })) } }
    }
    case "add_task": {
      const due = /^\d{4}-\d{2}-\d{2}/.test(args.due || "") ? args.due.slice(0, 10) : undefined
      const task = await addTask(g, { title: String(args.title || "").slice(0, 500), due, notes: args.notes })
      return { result: { ok: true, id: task.id }, action: { type: "task", ...task } }
    }
    case "complete_task": {
      const task = await completeTask(g, String(args.id || ""))
      return { result: { ok: true }, action: { type: "task", ...task } }
    }
  }
}

const runGmailTool = async (name, args, ctx) => {
  const g = ctx.google
  switch (name) {
    case "search_emails": {
      const emails = await listMail(g, { q: String(args.query || "is:unread category:primary"), max: Math.min(Number(args.max) || 8, 15) })
      return { result: { emails: emails.map(({ id, from, fromEmail, subject, date, snippet, unread }) => ({ id, from, fromEmail, subject, when: date ? formatWhen(date, ctx.timeZone) : undefined, snippet, unread })) } }
    }
    case "read_email": {
      const m = await readMail(g, String(args.id || ""))
      return { result: { id: m.id, from: m.from, fromEmail: m.fromEmail, to: m.to, subject: m.subject, when: m.date ? formatWhen(m.date, ctx.timeZone) : undefined, body: m.body.slice(0, 4000) } }
    }
    case "draft_email": {
      const body = String(args.body || "").trim()
      if (!body) return { result: { error: "The email is empty" } }
      if (!args.reply_to_id && !/\S+@\S+\.\S+/.test(String(args.to || ""))) return { result: { error: "Give the email address to send to (ask the user)" } }
      const draft = await createDraft(g, { replyToId: args.reply_to_id || null, to: args.to, subject: String(args.subject || "").slice(0, 200) || "(no subject)", body })
      return { result: { ok: true, savedAsDraft: true, to: draft.to, subject: draft.subject }, action: { type: "draft", to: draft.to, subject: draft.subject, body, link: "https://mail.google.com/mail/u/0/#drafts" } }
    }
  }
}
