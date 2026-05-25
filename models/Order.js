const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderId: String,
  name: String,
  email: String,
  phone: String,
  address: String,
  doorNo: String,
  building: String,
  area: String,
  taluk: String,
  district: String,
  state: String,
  pincode: String,
  addressExtra: String,
  payment: String,
  subtotal: Number,
  deliveryCharge: Number,
  total: Number,
  items: Array,
  razorpayPaymentId: String,
  razorpayRefundId: String,
  refundStatus: String,
  status: { type: String, default: "Processing" },
  handedToLogistics: { type: Boolean, default: false },
  cancelReason: String,
  cancelReasonCode: String,
  cancelledBy: String,
  cancelledAt: Date,
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Order", orderSchema);
