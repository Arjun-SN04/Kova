import mongoose from "mongoose"
import User from "../models/user.model.js"
import { BusinessSettings } from "../models/business.model.js"
import { Customer } from "../models/customer.model.js"
import { Product } from "../models/product.model.js"
import { Order, ORDER_STATUSES } from "../models/order.model.js"
import { Booking } from "../models/booking.model.js"
import { Message } from "../models/message.model.js"
import { emitToUsers } from "../utils/notify.js"
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary.js"
import { deliverText } from "../utils/deliver.js"
import { createEvent, deleteEvent, getAccount } from "../utils/google.js"
import { safeZone } from "../utils/agenda.js"
import { fillTemplate, formatIn, freeSlots, getSettings, hoursState, money, roleIn, sendAsBusiness, teamOf } from "../utils/business.js"
import { CONTACT_FIELDS, connect } from "./contact.controller.js"
import { normalizeUsername } from "../utils/username.js"

const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b)
const fail = (res, status, error) => res.status(status).json({ error })
const str = (v, max) => String(v ?? "").trim().slice(0, max)
const isId = (id) => mongoose.isValidObjectId(id)

export const STATUS_LABELS = { new: "received", confirmed: "confirmed", ready: "ready for pickup", shipped: "out for delivery", done: "complete", cancelled: "cancelled" }

// ── Cards in chat ──────────────────────────────────────────────
// Change every chat card that matches (e.g. all cards for one order) and tell both sides + the team
const updateCards = async (filter, patch, ownerId) => {
  const messages = await Message.find(filter)
  const settings = ownerId ? await BusinessSettings.findOne({ owner: ownerId }).select("team") : null
  for (const m of messages) {
    m.card = { ...m.card, ...patch }
    m.markModified("card")
    await m.save()
    emitToUsers([m.senderId, m.receiverId, ...(settings ? teamOf(ownerId, settings) : [])], "messageEdited", m)
  }
}

const orderCard = (order, owner) => ({
  kind: "order",
  orderId: String(order._id),
  number: order.number,
  business: String(owner._id),
  businessName: owner.fullName,
  items: order.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, image: i.image || "" })),
  total: order.total,
  note: order.note,
  status: order.status,
  paid: order.paid,
})

const productCard = (p, owner) => ({
  kind: "product",
  productId: String(p._id),
  business: String(owner._id),
  username: owner.username,
  name: p.name,
  price: p.price,
  description: p.description,
  image: p.image?.url || null,
  inStock: p.inStock,
})

const bookingCard = (b, owner) => ({
  kind: "booking",
  bookingId: String(b._id),
  business: String(owner._id),
  businessName: owner.fullName,
  service: b.service.name,
  minutes: b.service.minutes,
  start: b.start,
  end: b.end,
  timeZone: owner.business?.timeZone || "UTC",
  status: b.status,
  meetLink: b.meetLink,
})

// Make sure a customer and a business are connected, and the customer has a record
const ensureCustomer = async (customerId, owner) => {
  const me = await User.findById(customerId).select("contacts")
  if (!me.contacts.some((c) => same(c, owner._id))) {
    const [mine] = await connect(customerId, owner._id)
    emitToUsers([owner._id], "contactAdded", mine)
  }
  await Customer.updateOne({ business: owner._id, customer: customerId }, { $setOnInsert: { firstAt: new Date() } }, { upsert: true })
}

const findBusiness = async (id) => {
  if (!isId(id)) return null
  const owner = await User.findById(id).select("fullName username avatar email business")
  return owner?.business?.enabled ? owner : null
}

// ── The public business page ───────────────────────────────────
export const getPublicBusiness = async (req, res) => {
  try {
    const owner = await User.findOne({ username: normalizeUsername(req.params.username), "business.enabled": true }).select("fullName username avatar business contacts")
    if (!owner) return fail(res, 404, "This business doesn't exist or isn't on Kova any more")
    const [products, settings] = await Promise.all([
      Product.find({ business: owner._id }).sort({ position: 1, createdAt: 1 }),
      getSettings(owner._id),
    ])
    const me = req.user
    const relation = !me ? "guest" : same(me._id, owner._id) ? "owner" : owner.contacts.some((c) => same(c, me._id)) ? "contact" : "none"
    const { contacts, ...profile } = owner.toObject()
    res.status(200).json({
      business: { ...profile, status: hoursState(owner.business) },
      products,
      services: settings.services.map((s) => ({ _id: s._id, name: s.name, minutes: s.minutes, price: s.price, description: s.description })),
      relation,
      role: me ? roleIn(me._id, owner._id, settings) : null,
    })
  } catch (error) {
    console.log("getPublicBusiness error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const getSlots = async (req, res) => {
  try {
    const owner = await User.findOne({ username: normalizeUsername(req.params.username), "business.enabled": true }).select("business")
    if (!owner) return fail(res, 404, "Business not found")
    const settings = await getSettings(owner._id)
    const service = settings.services.id(req.query.service)
    if (!service) return fail(res, 404, "Pick a service")
    const date = String(req.query.date || "")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 400, "Pick a date")
    res.status(200).json({ slots: await freeSlots(owner, service, date), timeZone: owner.business.timeZone || "UTC" })
  } catch (error) {
    console.log("getSlots error:", error)
    fail(res, 500, "Internal server error")
  }
}

// "Message" on a business page: connect without a contact request
export const connectToBusiness = async (req, res) => {
  try {
    const owner = await findBusiness(req.params.bizId)
    if (!owner) return fail(res, 404, "Business not found")
    if (same(owner._id, req.user._id)) return fail(res, 400, "That's your own business")
    await ensureCustomer(req.user._id, owner)
    res.status(200).json({ user: await User.findById(owner._id).select(CONTACT_FIELDS) })
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message)
    console.log("connectToBusiness error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Catalog (owner and admins) ─────────────────────────────────
export const listProducts = async (req, res) => {
  const products = await Product.find({ business: req.biz.owner._id }).sort({ position: 1, createdAt: 1 })
  res.status(200).json({ products })
}

const productFields = (body) => {
  const price = Number(body.price)
  return {
    name: str(body.name, 80),
    description: str(body.description, 600),
    price: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : NaN,
    inStock: body.inStock === undefined ? true : body.inStock === true || body.inStock === "true",
    ...(body.position !== undefined ? { position: Number(body.position) || 0 } : {}),
  }
}

export const createProduct = async (req, res) => {
  try {
    const fields = productFields(req.body)
    if (!fields.name) return fail(res, 400, "Give it a name")
    if (Number.isNaN(fields.price)) return fail(res, 400, "Enter a price")
    if (await Product.countDocuments({ business: req.biz.owner._id }) >= 200) return fail(res, 400, "A catalog can have up to 200 items")
    const image = req.file ? await uploadToCloudinary(req.file, { subfolder: "products" }) : null
    const product = await Product.create({ ...fields, business: req.biz.owner._id, image: image ? { url: image.url, publicId: image.publicId } : null })
    res.status(201).json({ product })
  } catch (error) {
    console.log("createProduct error:", error)
    fail(res, 500, "Couldn't save the item. Try again.")
  }
}

export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, business: req.biz.owner._id })
    if (!product) return fail(res, 404, "Item not found")
    const fields = productFields({ ...product.toObject(), ...req.body })
    if (!fields.name) return fail(res, 400, "Give it a name")
    if (Number.isNaN(fields.price)) return fail(res, 400, "Enter a price")
    const old = product.image
    if (req.file) {
      const image = await uploadToCloudinary(req.file, { subfolder: "products" })
      product.image = { url: image.url, publicId: image.publicId }
    } else if (req.body.removeImage === "true" || req.body.removeImage === true) {
      product.image = null
    }
    Object.assign(product, fields)
    await product.save()
    if (old?.publicId && old.publicId !== product.image?.publicId) deleteFromCloudinary([{ publicId: old.publicId, resourceType: "image" }])
    // Product cards already in chats show the new name, price and stock
    await updateCards({ "card.kind": "product", "card.productId": String(product._id) }, productCard(product, req.biz.owner), req.biz.owner._id)
    res.status(200).json({ product })
  } catch (error) {
    console.log("updateProduct error:", error)
    fail(res, 500, "Couldn't save the item. Try again.")
  }
}

export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, business: req.biz.owner._id })
    if (!product) return fail(res, 404, "Item not found")
    if (product.image?.publicId) deleteFromCloudinary([{ publicId: product.image.publicId, resourceType: "image" }])
    await updateCards({ "card.kind": "product", "card.productId": String(product._id) }, { inStock: false, removed: true }, req.biz.owner._id)
    res.status(200).json({ deleted: String(product._id) })
  } catch (error) {
    console.log("deleteProduct error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Cards the business sends: product, payment request ─────────
export const sendCard = async (req, res) => {
  try {
    const { owner } = req.biz
    const customerId = req.params.customerId
    const sentBy = same(req.user._id, owner._id) ? null : req.user._id
    const isCustomer = await Customer.exists({ business: owner._id, customer: customerId })
    if (!isCustomer && !sentBy) await Customer.updateOne({ business: owner._id, customer: customerId }, { $setOnInsert: { firstAt: new Date() } }, { upsert: true })
    else if (!isCustomer) return fail(res, 404, "Customer not found")

    if (req.body.kind === "product") {
      const product = await Product.findOne({ _id: req.body.productId, business: owner._id })
      if (!product) return fail(res, 404, "Item not found")
      const msg = await deliverText({ senderId: owner._id, receiverId: customerId, text: `${product.name} · ${money(product.price)}`, card: productCard(product, owner), sentBy })
      return res.status(201).json(msg)
    }

    if (req.body.kind === "payment") {
      let amount = Number(req.body.amount)
      let order = null
      if (req.body.orderId) {
        order = await Order.findOne({ _id: req.body.orderId, business: owner._id, customer: customerId })
        if (!order) return fail(res, 404, "Order not found")
        if (!req.body.amount) amount = order.total
      }
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return fail(res, 400, "Enter an amount")
      amount = Math.round(amount * 100) / 100
      const note = str(req.body.note, 120) || (order ? `Order #${order.number}` : "")
      const card = {
        kind: "payment",
        business: String(owner._id),
        payee: owner.fullName,
        upiId: owner.business.upiId || null,
        amount,
        note,
        orderId: order ? String(order._id) : null,
        number: order?.number || null,
        status: order?.paid ? "paid" : "pending",
      }
      const msg = await deliverText({ senderId: owner._id, receiverId: customerId, text: `Payment request: ${money(amount)}${note ? ` · ${note}` : ""}`, card, sentBy })
      return res.status(201).json(msg)
    }
    fail(res, 400, "Unknown card")
  } catch (error) {
    console.log("sendCard error:", error)
    fail(res, 400, error.message || "Couldn't send that")
  }
}

// The customer taps "I've paid": the business sees it and confirms
export const claimPayment = async (req, res) => {
  try {
    const msg = await Message.findById(req.params.messageId)
    if (!msg?.card || msg.card.kind !== "payment" || !same(msg.receiverId, req.user._id)) return fail(res, 404, "Payment not found")
    if (msg.card.status === "paid") return res.status(200).json(msg)
    await updateCards({ _id: msg._id }, { status: "claimed", claimedAt: new Date() }, msg.card.business)
    res.status(200).json(await Message.findById(msg._id))
  } catch (error) {
    console.log("claimPayment error:", error)
    fail(res, 500, "Internal server error")
  }
}

// The business marks a payment as received (or not)
export const markPayment = async (req, res) => {
  try {
    const { owner } = req.biz
    const msg = await Message.findById(req.params.messageId)
    if (!msg?.card || msg.card.kind !== "payment" || !same(msg.senderId, owner._id)) return fail(res, 404, "Payment not found")
    const paid = req.body.paid !== false
    await updateCards({ _id: msg._id }, { status: paid ? "paid" : "pending", paidAt: paid ? new Date() : null }, owner._id)
    if (msg.card.orderId) {
      const order = await Order.findOneAndUpdate({ _id: msg.card.orderId, business: owner._id }, { $set: { paid, paidAt: paid ? new Date() : null } }, { new: true })
      if (order) await updateCards({ "card.kind": "order", "card.orderId": String(order._id) }, { paid }, owner._id)
    }
    res.status(200).json(await Message.findById(msg._id))
  } catch (error) {
    console.log("markPayment error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Orders ─────────────────────────────────────────────────────
// A customer sends an order from the business page's cart
export const placeOrder = async (req, res) => {
  try {
    const owner = await findBusiness(req.body.business)
    if (!owner) return fail(res, 404, "Business not found")
    if (same(owner._id, req.user._id)) return fail(res, 400, "You can't order from your own business")
    const wanted = (Array.isArray(req.body.items) ? req.body.items : []).slice(0, 50)
    const products = await Product.find({ _id: { $in: wanted.map((i) => i.product).filter(isId) }, business: owner._id })
    const items = []
    for (const w of wanted) {
      const p = products.find((x) => same(x._id, w.product))
      const qty = Math.min(99, Math.max(1, Math.round(Number(w.qty) || 1)))
      if (!p) return fail(res, 400, "One of those items is no longer in the catalog")
      if (!p.inStock) return fail(res, 400, `${p.name} is out of stock`)
      items.push({ product: p._id, name: p.name, price: p.price, qty, image: p.image?.url || "" })
    }
    if (!items.length) return fail(res, 400, "Your cart is empty")
    await ensureCustomer(req.user._id, owner)
    const settings = await BusinessSettings.findOneAndUpdate({ owner: owner._id }, { $inc: { orderSeq: 1 } }, { new: true })
    const total = Math.round(items.reduce((n, i) => n + i.price * i.qty, 0) * 100) / 100
    const order = await Order.create({ business: owner._id, customer: req.user._id, number: settings.orderSeq, items, total, note: str(req.body.note, 500) })
    const msg = await deliverText({
      senderId: req.user._id,
      receiverId: owner._id,
      text: `Order #${order.number}: ${items.map((i) => `${i.qty} × ${i.name}`).join(", ")} · ${money(total)}`,
      card: orderCard(order, owner),
    })
    res.status(201).json({ order, message: msg })
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message)
    console.log("placeOrder error:", error)
    fail(res, 500, "Couldn't place the order. Try again.")
  }
}

export const myOrders = async (req, res) => {
  const orders = await Order.find({ customer: req.user._id }).sort({ createdAt: -1 }).limit(100).populate("business", "fullName username avatar")
  res.status(200).json({ orders })
}

export const listOrders = async (req, res) => {
  try {
    const filter = { business: req.biz.owner._id }
    if (isId(req.query.customer)) filter.customer = req.query.customer
    if (ORDER_STATUSES.includes(req.query.status)) filter.status = req.query.status
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(500).populate("customer", "fullName username avatar email")
    res.status(200).json({ orders })
  } catch (error) {
    console.log("listOrders error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Change an order's status / paid flag; optionally tell the customer (template or default text)
export const updateOrder = async (req, res) => {
  try {
    const { owner } = req.biz
    const order = await Order.findOne({ _id: req.params.id, business: owner._id }).populate("customer", "fullName")
    if (!order) return fail(res, 404, "Order not found")
    const before = order.status
    if (req.body.status !== undefined) {
      if (!ORDER_STATUSES.includes(req.body.status)) return fail(res, 400, "Unknown status")
      order.status = req.body.status
    }
    if (req.body.paid !== undefined) {
      order.paid = !!req.body.paid
      order.paidAt = order.paid ? new Date() : null
    }
    await order.save()
    await updateCards({ "card.kind": "order", "card.orderId": String(order._id) }, { status: order.status, paid: order.paid }, owner._id)
    if (req.body.paid !== undefined) await updateCards({ "card.kind": "payment", "card.orderId": String(order._id) }, { status: order.paid ? "paid" : "pending" }, owner._id)

    if (req.body.notify && (before !== order.status || req.body.text)) {
      const vars = { name: order.customer?.fullName?.split(" ")[0] || "there", order: `#${order.number}`, id: order.number, total: money(order.total), status: STATUS_LABELS[order.status] }
      const text = req.body.text ? fillTemplate(str(req.body.text, 2000), vars) : `Your order #${order.number} is ${STATUS_LABELS[order.status]}.`
      await sendAsBusiness(owner._id, order.customer._id, text, { sentBy: same(req.user._id, owner._id) ? null : req.user._id }).catch(() => {})
    }
    res.status(200).json({ order })
  } catch (error) {
    console.log("updateOrder error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Bookings ───────────────────────────────────────────────────
export const createBooking = async (req, res) => {
  try {
    const owner = await findBusiness(req.body.business)
    if (!owner) return fail(res, 404, "Business not found")
    if (same(owner._id, req.user._id)) return fail(res, 400, "You can't book your own business")
    const settings = await getSettings(owner._id)
    const service = settings.services.id(req.body.serviceId)
    if (!service) return fail(res, 404, "That service isn't available")
    const start = new Date(req.body.start)
    if (Number.isNaN(start.getTime())) return fail(res, 400, "Pick a time")
    const tz = safeZone(owner.business.timeZone || "UTC")
    const ymd = start.toLocaleDateString("en-CA", { timeZone: tz })
    const slot = (await freeSlots(owner, service, ymd)).find((s) => s.start.getTime() === start.getTime())
    if (!slot) return fail(res, 409, "That time was just taken. Pick another one.")

    await ensureCustomer(req.user._id, owner)
    const customer = await User.findById(req.user._id).select("fullName email")
    const booking = await Booking.create({
      business: owner._id,
      customer: req.user._id,
      service: { id: String(service._id), name: service.name, minutes: service.minutes, price: service.price },
      start: slot.start,
      end: slot.end,
      note: str(req.body.note, 500),
    })
    // Add it to the business's Google Calendar (with a Meet link) when Google is connected
    const account = await getAccount(owner._id).catch(() => null)
    if (account) {
      try {
        const event = await createEvent(account, {
          title: `${service.name} with ${customer.fullName}`,
          start: slot.start,
          end: slot.end,
          description: `Booked on Kova.${booking.note ? `\nNote: ${booking.note}` : ""}`,
          attendees: [customer.email],
          meet: true,
          timeZone: tz,
        })
        booking.eventId = event.id
        booking.meetLink = event.meetLink || null
        await booking.save()
      } catch (err) {
        console.log("booking calendar error:", err.message)
      }
    }
    const msg = await sendAsBusiness(owner._id, req.user._id, `Booked: ${service.name} on ${formatIn(slot.start, tz)}`, { card: bookingCard(booking, owner), auto: "booking" })
    res.status(201).json({ booking, message: msg })
  } catch (error) {
    if (error.status) return fail(res, error.status, error.message)
    console.log("createBooking error:", error)
    fail(res, 500, "Couldn't book that. Try again.")
  }
}

export const myBookings = async (req, res) => {
  const bookings = await Booking.find({ customer: req.user._id }).sort({ start: -1 }).limit(100).populate("business", "fullName username avatar business.timeZone")
  res.status(200).json({ bookings })
}

export const listBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ business: req.biz.owner._id, start: { $gte: new Date(Date.now() - 30 * 86_400_000) } })
      .sort({ start: 1 }).limit(500).populate("customer", "fullName username avatar email")
    res.status(200).json({ bookings })
  } catch (error) {
    console.log("listBookings error:", error)
    fail(res, 500, "Internal server error")
  }
}

const setBookingStatus = async (booking, status, byUserId) => {
  const owner = await User.findById(booking.business).select("fullName username business")
  booking.status = status
  await booking.save()
  if (status === "cancelled" && booking.eventId) {
    const account = await getAccount(owner._id).catch(() => null)
    if (account) await deleteEvent(account, booking.eventId).catch(() => {})
  }
  await updateCards({ "card.kind": "booking", "card.bookingId": String(booking._id) }, { status }, owner._id)
  if (status === "cancelled") {
    const byCustomer = same(byUserId, booking.customer)
    const text = `${byCustomer ? "I cancelled" : "We cancelled"} the ${booking.service.name} on ${formatIn(booking.start, owner.business?.timeZone)}.`
    if (byCustomer) await deliverText({ senderId: booking.customer, receiverId: owner._id, text }).catch(() => {})
    else await sendAsBusiness(owner._id, booking.customer, text).catch(() => {})
  }
  return booking
}

// The customer cancels their own booking
export const cancelMyBooking = async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, customer: req.user._id, status: "booked" })
    if (!booking) return fail(res, 404, "Booking not found")
    res.status(200).json({ booking: await setBookingStatus(booking, "cancelled", req.user._id) })
  } catch (error) {
    console.log("cancelMyBooking error:", error)
    fail(res, 500, "Internal server error")
  }
}

// The team marks a booking done or cancels it
export const updateBooking = async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, business: req.biz.owner._id })
    if (!booking) return fail(res, 404, "Booking not found")
    if (!["done", "cancelled", "booked"].includes(req.body.status)) return fail(res, 400, "Unknown status")
    res.status(200).json({ booking: await setBookingStatus(booking, req.body.status, req.user._id) })
  } catch (error) {
    console.log("updateBooking error:", error)
    fail(res, 500, "Internal server error")
  }
}
