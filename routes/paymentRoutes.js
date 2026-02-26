const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const Product = require("../models/product");
const Order = require("../models/Order");
const { authUser } = require("../middleware/auth");
const { sendOrderConfirmation } = require("../services/emailService");

let razorpay = null;

function getRazorpay() {
  if (!razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return razorpay;
}

/* Create Razorpay order */
router.post("/create-order", authUser, async (req, res) => {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: "Payment not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env" });
    }
    const { amount, items } = req.body;
    if (!amount || amount < 1) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const products = await Product.find();
    for (const item of items || []) {
      const p = products.find(x => x._id.toString() === item.id);
      if (!p) return res.status(400).json({ error: `Product ${item.name} not found` });
      const stock = p.stock ?? 0;
      if (stock < (item.quantity || 1)) {
        return res.status(400).json({ error: `Insufficient stock for ${item.name}. Available: ${stock}` });
      }
    }

    const rzp = getRazorpay();
    if (!rzp) return res.status(503).json({ error: "Payment not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env" });
    const options = {
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: "v2r_" + Date.now()
    };
    const order = await rzp.orders.create(options);
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID || ""
    });
  } catch (err) {
    console.error("Razorpay create order:", err);
    res.status(500).json({ error: err.message || "Payment initiation failed" });
  }
});

/* Verify payment and create order */
router.post("/verify", authUser, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderData } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderData) {
      return res.status(400).json({ error: "Missing payment details" });
    }

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(sign)
      .digest("hex");
    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const { name, phone, address, items, total, email } = orderData;
    if (!name || !phone || !address || !items || !total) {
      return res.status(400).json({ error: "Invalid order data" });
    }

    const ProductModel = require("../models/product");
    for (const item of items) {
      const p = await ProductModel.findById(item.id);
      if (!p) return res.status(400).json({ error: `Product ${item.name} not found` });
      const stock = p.stock ?? 0;
      const qty = item.quantity || 1;
      if (stock < qty) {
        return res.status(400).json({ error: `Insufficient stock for ${item.name}` });
      }
      await ProductModel.findByIdAndUpdate(item.id, { $inc: { stock: -qty } });
    }

    const newOrder = new Order({
      orderId: "V2R" + Date.now(),
      name,
      phone,
      address,
      email: email || req.user.email,
      payment: "Online",
      total,
      items: items.map(i => ({ ...i, trackStatus: "Processing" })),
      razorpayPaymentId: razorpay_payment_id || "",
      status: "Processing"
    });
    await newOrder.save();

    try {
      await sendOrderConfirmation(email || req.user.email, newOrder);
    } catch (e) {
      console.warn("Order email failed:", e.message);
    }

    res.status(201).json({ message: "Order placed", order: newOrder });
  } catch (err) {
    console.error("Verify payment:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
