import mongoose from "mongoose"

const { ObjectId } = mongoose.Schema.Types

// An item or service in a business's catalog
const productSchema = new mongoose.Schema({
  business: { type: ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: "", maxlength: 600 },
  price: { type: Number, required: true, min: 0 },
  inStock: { type: Boolean, default: true },
  image: { type: { url: String, publicId: String, _id: false }, default: null },
  // Display order (lower first)
  position: { type: Number, default: 0 },
}, { timestamps: true })

export const Product = mongoose.model("Product", productSchema)
