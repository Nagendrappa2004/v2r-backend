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
  }
});

module.exports = mongoose.model("Order", orderSchema);
