import mongoose from "mongoose"

const { ObjectId } = mongoose.Schema.Types

export const ORDER_STATUSES = ["new", "confirmed", "ready", "shipped", "done", "cancelled"]

// A customer's order from a business's catalog
const orderSchema = new mongoose.Schema({
  business: { type: ObjectId, ref: "User", required: true, index: true },
  customer: { type: ObjectId, ref: "User", required: true, index: true },
  number: { type: Number, required: true },
  items: [{ _id: false, product: ObjectId, name: String, price: Number, qty: Number, image: String }],
  total: { type: Number, required: true },
  note: { type: String, default: "", maxlength: 500 },
  status: { type: String, enum: ORDER_STATUSES, default: "new" },
  paid: { type: Boolean, default: false },
  paidAt: { type: Date, default: null },
  // Before any discount code, and the code used
  subtotal: { type: Number, default: null },
  discount: { type: Number, default: 0 },
  coupon: { type: String, default: "" },
  // Every status / payment change, for the tracking page
  history: [{ _id: false, status: String, at: { type: Date, default: Date.now } }],
  // The customer's rating once the order is done
  review: { type: { rating: Number, text: String, at: Date, _id: false }, default: null },
}, { timestamps: true })

orderSchema.index({ business: 1, "review.at": -1 })

orderSchema.index({ business: 1, number: 1 }, { unique: true })

export const Order = mongoose.model("Order", orderSchema)
