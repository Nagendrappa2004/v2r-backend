const PDFDocument = require("pdfkit");
const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Product = require("../models/product");
const StoreSettings = require("../models/StoreSettings");
const { authUser, authAdmin } = require("../middleware/auth");
const { sendOrderConfirmation } = require("../services/emailService");
let Razorpay;
try {
  Razorpay = require("razorpay");
} catch (e) {
  Razorpay = null;
}

async function restoreOrderStock(order) {
  for (const item of order.items || []) {
    const id = item.id;
    if (!id) continue;
    const qty = item.quantity || 1;
    await Product.findByIdAndUpdate(id, { $inc: { stock: qty } });
  }
}

async function razorpayRefundForOrder(order) {
  if (
    order.payment !== "Online" ||
    !order.razorpayPaymentId ||
    !Razorpay ||
    !process.env.RAZORPAY_KEY_ID ||
    !process.env.RAZORPAY_KEY_SECRET
  ) {
    return { ok: false, reason: "skipped_no_online_payment", refundId: "" };
  }
  const rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  const amountPaise = Math.round(Number(order.total) * 100);
  if (amountPaise < 1) {
    return { ok: false, reason: "invalid_amount", refundId: "" };
  }
  try {
    const refund = await rzp.refunds.create({
      payment_id: order.razorpayPaymentId,
      amount: amountPaise,
      notes: {
        order_id: order.orderId,
        reason: "customer_cancellation"
      }
    });
    return { ok: true, refundId: refund.id || "", raw: refund };
  } catch (err) {
    const msg = (err && (err.error && err.error.description)) || err.message || "";
    if (/already been fully refunded|full refund already exists|duplicate/i.test(msg)) {
      return { ok: true, refundId: "already_refunded", duplicate: true };
    }
    console.error("Razorpay refund error:", err.error || err);
    return { ok: false, reason: msg || "refund_failed", refundId: "" };
  }
}

/* Orders are created via payment verification - see paymentRoutes */

/* ===============================
   PUBLIC: customer cancellation policy
================================ */
router.get("/cancel-policy", async (req, res) => {
  try {
    const s = await StoreSettings.getStoreSettings();
    res.json({ allowCustomerOrderCancel: !!s.allowCustomerOrderCancel });
  } catch (e) {
    res.json({ allowCustomerOrderCancel: true });
  }
});

/* ===============================
   GET MY ORDERS (CUSTOMER)
================================ */
router.get("/my-orders", authUser, async (req, res) => {
  try {
    const orders = await Order.find({ email: req.user.email }).sort({ date: -1 });
    const settings = await StoreSettings.getStoreSettings();
    res.json({
      orders,
      cancelPolicy: { allowCustomerOrderCancel: !!settings.allowCustomerOrderCancel }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ADMIN STORE SETTINGS (cancel window)
================================ */
router.get("/admin/settings", authAdmin, async (req, res) => {
  try {
    const s = await StoreSettings.getStoreSettings();
    res.json({ allowCustomerOrderCancel: !!s.allowCustomerOrderCancel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/admin/settings", authAdmin, async (req, res) => {
  try {
    const allow =
      typeof req.body.allowCustomerOrderCancel === "boolean"
        ? req.body.allowCustomerOrderCancel
        : true;
    const s = await StoreSettings.getStoreSettings();
    s.allowCustomerOrderCancel = allow;
    await s.save();
    res.json({ allowCustomerOrderCancel: !!s.allowCustomerOrderCancel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Mark order handed to logistics — blocks customer cancel */
router.put("/admin/logistics/:id", authAdmin, async (req, res) => {
  try {
    const handed = !!req.body.handedToLogistics;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status === "Cancelled") {
      return res.status(400).json({ error: "Order is cancelled" });
    }
    order.handedToLogistics = handed;
    await order.save();
    res.json({ message: "Updated", handedToLogistics: order.handedToLogistics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   GET ALL ORDERS (ADMIN)
================================ */
router.get("/", authAdmin, async (req, res) => {
  try {
    const orders = await Order.find().sort({ date: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   DOWNLOAD INVOICE PDF (FIXED)
================================ */
router.get("/invoice/:id", async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id });

    if (!order) {
      return res.status(404).send("Order not found");
    }

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${order.orderId}.pdf`
    );

    doc.pipe(res);

    doc.fontSize(22).text("V2R HERITAGES", { align: "center" });
    doc.fontSize(14).text("INVOICE", { align: "center" });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Order ID: ${order.orderId}`);
    doc.text(`Customer: ${order.name}`);
    doc.text(`Phone: ${order.phone}`);
    doc.text(`Payment Method: ${order.payment}`);
    doc.text(`Total Amount: ₹ ${order.total}`);
    doc.moveDown();

    doc.text("Products:");
    doc.moveDown();

    order.items.forEach(item => {
      doc.text(
        `${item.name} | Qty: ${item.quantity} | Price: ₹ ${item.price}`
      );
    });

    doc.end();
  } catch (err) {
    console.error("Invoice Error:", err);
    res.status(500).send("Invoice generation error");
  }
});

router.put("/status/:id", authAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send("Not found");

    const prev = order.status;
    order.status = status;
    if (status === "Cancelled" && prev !== "Cancelled") {
      order.cancelledAt = new Date();
      order.cancelledBy = "admin";
      if (req.body.cancelReason) {
        order.cancelReason = String(req.body.cancelReason).slice(0, 2000);
      }
      await restoreOrderStock(order);
      const ref = await razorpayRefundForOrder(order);
      if (ref.ok) {
        order.refundStatus = ref.duplicate ? "completed" : "completed";
        order.razorpayRefundId = ref.refundId || order.razorpayRefundId;
      } else if (ref.reason === "skipped_no_online_payment") {
        order.refundStatus = "skipped";
      } else {
        order.refundStatus = "failed";
      }
    }
    await order.save();
    res.send("updated");
  } catch (e) {
    res.status(500).send(e.message);
  }
});

/* Cancel order & refund (customer; before logistics + policy open) */
router.post("/cancel/:orderId", authUser, async (req, res) => {
  try {
    const { reason, reasonCode } = req.body || {};
    const reasonText = (reason && String(reason).trim()) || "";
    const code = (reasonCode && String(reasonCode).trim()) || "OTHER";
    if (!reasonText || reasonText.length < 5) {
      return res.status(400).json({ error: "Please provide a cancellation reason (min 5 characters)." });
    }

    const settings = await StoreSettings.getStoreSettings();
    if (!settings.allowCustomerOrderCancel) {
      return res.status(403).json({
        error: "Order cancellation is currently closed. Please contact support."
      });
    }

    const order = await Order.findOne({
      orderId: req.params.orderId,
      email: req.user.email
    });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "Processing") {
      return res.status(400).json({ error: "This order cannot be cancelled at this stage." });
    }
    if (order.handedToLogistics) {
      return res.status(400).json({
        error: "This order has already been handed to logistics and cannot be cancelled online."
      });
    }

    await restoreOrderStock(order);

    order.refundStatus = "initiated";
    const ref = await razorpayRefundForOrder(order);
    if (ref.ok) {
      order.refundStatus = "completed";
      order.razorpayRefundId = ref.refundId || "";
    } else if (ref.reason === "skipped_no_online_payment") {
      order.refundStatus = "skipped";
    } else {
      order.refundStatus = "failed";
      console.error("Refund failed for order", order.orderId, ref.reason);
    }

    order.status = "Cancelled";
    order.cancelReason = reasonText.slice(0, 2000);
    order.cancelReasonCode = code.slice(0, 64);
    order.cancelledAt = new Date();
    order.cancelledBy = "customer";
    await order.save();

    res.json({
      message:
        order.refundStatus === "completed"
          ? "Order cancelled. Refund will appear per your bank/UPI timeline."
          : order.refundStatus === "skipped"
          ? "Order cancelled."
          : "Order cancelled. Refund could not be completed automatically — support will assist.",
      refundStatus: order.refundStatus
    });
  } catch (err) {
    console.error("Cancel/refund error:", err);
    res.status(500).json({ error: err.message || "Cancel/refund failed" });
  }
});

/* ===============================
   ADMIN ANALYTICS (PROTECTED)
================================ */
router.get("/analytics/summary", authAdmin, async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const revenueAgg = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;
    const orders = await Order.find().sort({ date: -1 });
    const users = await require("../models/User").countDocuments();
    const products = await require("../models/product").countDocuments();

    res.json({
      totalOrders,
      totalRevenue,
      totalUsers: users,
      totalProducts: products,
      orders
    });
  } catch (err) {
    res.status(500).json({ error: "Analytics error" });
  }
});

/* ===============================
   PRODUCT PERFORMANCE ANALYTICS
================================ */
router.get("/analytics/low-stock", authAdmin, async (req, res) => {
  try {
    const ProductModel = require("../models/product");
    const lowStock = await ProductModel.find({
      $or: [{ stock: { $lte: 10 } }, { stock: { $exists: false } }]
    }).limit(20);
    res.json(lowStock);
  } catch (err) {
    res.status(500).json({ error: "Low stock fetch failed" });
  }
});

router.get("/analytics/products", authAdmin, async (req, res) => {
  try {
    const data = await Order.aggregate([
      { $match: { status: { $ne: "Cancelled" } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          totalQty: { $sum: "$items.quantity" },
          revenue: {
            $sum: { $multiply: ["$items.price", "$items.quantity"] }
          }
        }
      },
      { $sort: { totalQty: -1 } }
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Product analytics error" });
  }
});

/* ===============================
   EXPORT ORDERS CSV (TALLY)
================================ */
const { Parser } = require("json2csv");

router.get("/export/csv", authAdmin, async (req, res) => {
  try {
    const orders = await Order.find();

    const rows = [];

    orders.forEach(o => {
      o.items.forEach(i => {
        rows.push({
          OrderID: o.orderId,
          Date: new Date(o.date).toLocaleDateString(),
          Customer: o.name,
          Phone: o.phone,
          Payment: o.payment,
          Product: i.name,
          Qty: i.quantity,
          Price: i.price,
          Total: o.total,
          Status: o.status || "Processing",
          CancelReason: o.cancelReason || "",
          RefundStatus: o.refundStatus || "",
          RefundId: o.razorpayRefundId || ""
        });
      });
    });

    const parser = new Parser();
    const csv = parser.parse(rows);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=orders.csv");

    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: "CSV export failed" });
  }
});

module.exports = router;
