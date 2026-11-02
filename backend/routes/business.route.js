import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import optionalAuth from "../middleware/optionalAuth.js"
import { uploadAvatarSingle } from "../config/cloudinary.js"
import {
  addInternalNote, addTeamMember, closeReport, decideVerification, deleteInternalNote, getCustomerChat, getInsights,
  getMyBusiness, getOverview, listCustomers, listVerifications, loadBusiness, removeTeamMember, replyToCustomer,
  requestVerification, sendBroadcast, updatePaymentQr, deleteBusiness, summaryNow, updateCover, updateCustomer, updateProfile, updateSettings,
} from "../controller/business.controller.js"
import {
  cancelMyBooking, claimPayment, connectToBusiness, createBooking, createProduct, deleteProduct, getPublicBusiness, getSlots,
  checkCoupon, trackOrder, reviewOrder, listBookings, listOrders, listProducts, markPayment, myBookings, myOrders, placeOrder, sendCard, updateBooking, updateOrder, updateProduct,
} from "../controller/commerce.controller.js"

const router = express.Router()

// Public business page (works signed out)
router.get("/public/:username", optionalAuth, getPublicBusiness)
router.get("/public/:username/slots", optionalAuth, getSlots)
router.post("/public/:username/coupon", optionalAuth, checkCoupon)

router.use(secureRoute)

// My business account
router.get("/me", getMyBusiness)
router.put("/profile", updateProfile)
router.put("/cover", uploadAvatarSingle("cover"), updateCover)
router.put("/payment-qr", uploadAvatarSingle("qr"), updatePaymentQr)
router.delete("/me", deleteBusiness)
router.post("/verification", requestVerification)

// As a customer
router.post("/connect/:bizId", connectToBusiness)
router.post("/orders", placeOrder)
router.get("/orders/mine", myOrders)
router.get("/orders/:id/track", trackOrder)
router.post("/orders/:id/review", reviewOrder)
router.post("/bookings", createBooking)
router.get("/bookings/mine", myBookings)
router.put("/bookings/:id/cancel", cancelMyBooking)
router.put("/payments/:messageId/claim", claimPayment)

// App admins
router.get("/admin/verifications", listVerifications)
router.post("/admin/verifications/:userId", decideVerification)
router.put("/admin/reports/:id", closeReport)

// The business workspace: /business/:biz/... (":biz" is the owner's id, or "me")
const team = loadBusiness()
const managers = loadBusiness("owner", "admin")
const ownerOnly = loadBusiness("owner")

router.get("/:biz/overview", team, getOverview)
router.put("/:biz/settings", managers, updateSettings)
router.post("/:biz/team", ownerOnly, addTeamMember)
router.delete("/:biz/team/:userId", team, removeTeamMember)

router.get("/:biz/customers", team, listCustomers)
router.put("/:biz/customers/:customerId", team, updateCustomer)
router.post("/:biz/customers/:customerId/notes", team, addInternalNote)
router.delete("/:biz/customers/:customerId/notes/:noteId", team, deleteInternalNote)
router.get("/:biz/chat/:customerId", team, getCustomerChat)
router.post("/:biz/chat/:customerId", team, replyToCustomer)
router.post("/:biz/chat/:customerId/card", team, sendCard)
router.put("/:biz/payments/:messageId", team, markPayment)

router.get("/:biz/products", team, listProducts)
router.post("/:biz/products", managers, uploadAvatarSingle("image"), createProduct)
router.put("/:biz/products/:id", managers, uploadAvatarSingle("image"), updateProduct)
router.delete("/:biz/products/:id", managers, deleteProduct)

router.get("/:biz/orders", team, listOrders)
router.put("/:biz/orders/:id", team, updateOrder)
router.get("/:biz/bookings", team, listBookings)
router.put("/:biz/bookings/:id", team, updateBooking)

router.post("/:biz/broadcast", managers, sendBroadcast)
router.get("/:biz/insights", managers, getInsights)
router.post("/:biz/summary", ownerOnly, summaryNow)

export default router
