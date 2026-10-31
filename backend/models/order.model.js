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
}, { timestamps: true })

orderSchema.index({ business: 1, number: 1 }, { unique: true })

export const Order = mongoose.model("Order", orderSchema)
