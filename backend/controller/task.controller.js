import mongoose from "mongoose"
import { Task } from "../models/task.model.js"
import { Group } from "../models/group.model.js"
import { Message } from "../models/message.model.js"
import User from "../models/user.model.js"
import { emitToUsers } from "../utils/notify.js"
import { deliverText } from "../utils/deliver.js"

// To-dos in a group: anyone in the group can add, assign, tick off and delete them.
// A new task is also posted in the chat as a task card, which updates when it's done.

const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b)
const fail = (res, status, error) => res.status(status).json({ error })
const PERSON = "fullName username avatar"

const memberGroup = async (groupId, userId) =>
  mongoose.isValidObjectId(groupId) ? Group.findOne({ _id: groupId, members: userId }).select("members name announcement admins") : null

const taskCard = (task, assigneeName) => ({
  kind: "task",
  taskId: String(task._id),
  text: task.text,
  assignee: task.assignee ? String(task.assignee._id ?? task.assignee) : null,
  assigneeName: assigneeName ?? null,
  due: task.due,
  done: task.done,
})

// Tell the group, and update the task's chat card
const announce = async (group, task) => {
  emitToUsers(group.members, "tasksUpdated", { groupId: String(group._id) })
  const card = await Message.findOne({ "card.kind": "task", "card.taskId": String(task._id) })
  if (!card) return
  const assignee = task.assignee ? await User.findById(task.assignee).select("fullName") : null
  card.card = taskCard(task, assignee?.fullName)
  card.markModified("card")
  await card.save()
  emitToUsers(group.members, "messageEdited", card)
}

export const listTasks = async (req, res) => {
  try {
    const group = await memberGroup(req.params.groupId, req.user._id)
    if (!group) return fail(res, 404, "Group not found")
    const tasks = await Task.find({ group: group._id }).sort({ done: 1, due: 1, createdAt: -1 }).limit(300).populate("assignee createdBy doneBy", PERSON)
    res.status(200).json({ tasks })
  } catch (error) {
    console.log("listTasks error:", error)
    fail(res, 500, "Internal server error")
  }
}

const parseDue = (due) => {
  if (!due) return null
  const d = new Date(due)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export const createTask = async (req, res) => {
  try {
    const group = await memberGroup(req.body.groupId, req.user._id)
    if (!group) return fail(res, 404, "Group not found")
    const text = String(req.body.text || "").trim().slice(0, 300)
    if (!text) return fail(res, 400, "Describe the task")
    const assignee = req.body.assignee || null
    if (assignee && !group.members.some((m) => same(m, assignee))) return fail(res, 400, "That person isn't in this group")
    const due = parseDue(req.body.due)
    if (due === undefined) return fail(res, 400, "That due date doesn't look right")
    let messageId = null
    if (req.body.messageId && mongoose.isValidObjectId(req.body.messageId)) {
      messageId = (await Message.exists({ _id: req.body.messageId, groupId: group._id }))?._id || null
    }
    const task = await Task.create({ group: group._id, text, assignee, due, message: messageId, createdBy: req.user._id })
    // Post it in the chat (announcement groups: only admins post)
    const canPost = !group.announcement || group.admins.some((a) => same(a, req.user._id))
    if (canPost) {
      const person = assignee ? await User.findById(assignee).select("fullName") : null
      await deliverText({
        senderId: req.user._id,
        groupId: group._id,
        text: `Task: ${text}${person ? ` · ${person.fullName.split(" ")[0]}` : ""}`,
        card: taskCard(task, person?.fullName),
      }).catch((err) => console.log("task card error:", err.message))
    }
    emitToUsers(group.members, "tasksUpdated", { groupId: String(group._id) })
    res.status(201).json({ task: await task.populate("assignee createdBy", PERSON) })
  } catch (error) {
    console.log("createTask error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
    const group = task && await memberGroup(task.group, req.user._id)
    if (!group) return fail(res, 404, "Task not found")
    const b = req.body || {}
    if (b.text !== undefined) {
      const text = String(b.text).trim().slice(0, 300)
      if (!text) return fail(res, 400, "Describe the task")
      task.text = text
    }
    if (b.assignee !== undefined) {
      if (b.assignee && !group.members.some((m) => same(m, b.assignee))) return fail(res, 400, "That person isn't in this group")
      task.assignee = b.assignee || null
    }
    if (b.due !== undefined) {
      const due = parseDue(b.due)
      if (due === undefined) return fail(res, 400, "That due date doesn't look right")
      task.due = due
    }
    if (b.done !== undefined) {
      task.done = !!b.done
      task.doneAt = task.done ? new Date() : null
      task.doneBy = task.done ? req.user._id : null
    }
    await task.save()
    await announce(group, task)
    res.status(200).json({ task: await task.populate("assignee createdBy doneBy", PERSON) })
  } catch (error) {
    console.log("updateTask error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
    const group = task && await memberGroup(task.group, req.user._id)
    if (!group) return fail(res, 404, "Task not found")
    await task.deleteOne()
    // The chat card stays, marked as deleted
    const card = await Message.findOne({ "card.kind": "task", "card.taskId": String(task._id) })
    if (card) {
      card.card = { ...card.card, removed: true }
      card.markModified("card")
      await card.save()
      emitToUsers(group.members, "messageEdited", card)
    }
    emitToUsers(group.members, "tasksUpdated", { groupId: String(group._id) })
    res.status(200).json({ deleted: String(task._id) })
  } catch (error) {
    console.log("deleteTask error:", error)
    fail(res, 500, "Internal server error")
  }
}
