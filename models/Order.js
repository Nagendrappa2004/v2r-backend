const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderId: String,
  name: String,
  email: String,
  phone: String,
  address: String,
  payment: String,
  total: Number,
  items: Array,
  razorpayPaymentId: String,
  status: {
    type: String,
    default: "Processing"
  },
  date: {
    type: Date,
    default: Date.now
  },

  /* After true, customer can no longer cancel (handed to logistics / dispatch partner) */
  handedToLogistics: {
    type: Boolean,
    default: false
  },

  cancelReason: { type: String, default: "" },
  cancelReasonCode: { type: String, default: "" },
  cancelledAt: { type: Date },
  cancelledBy: { type: String, default: "" }, // customer | admin

  /* Razorpay refund tracking */
  refundStatus: {
    type: String,
    default: "none"
  }, // none | initiated | completed | failed | skipped
  razorpayRefundId: { type: String, default: "" }
});

module.exports = mongoose.model("Order", orderSchema);
