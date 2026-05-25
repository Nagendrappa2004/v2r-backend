const PDFDocument = require("pdfkit");
const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const { authUser, authAdmin } = require("../middleware/auth");
let Razorpay;
try { Razorpay = require("razorpay"); } catch (e) { Razorpay = null; }
const StoreSettings = require("../models/StoreSettings");

/* Orders are created via payment verification - see paymentRoutes */

/* ===============================
   ADMIN SETTINGS (cancel window, discount)
================================ */
router.get("/admin/settings", authAdmin, async (req, res) => {
  try {
    let s = await StoreSettings.findOne({ key: "main" });
    if (!s) s = await StoreSettings.create({ key: "main" });
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/admin/settings", authAdmin, async (req, res) => {
  try {
    const update = {};
    if (typeof req.body.allowCustomerOrderCancel === "boolean") update.allowCustomerOrderCancel = req.body.allowCustomerOrderCancel;
    if (typeof req.body.discountPercent === "number") update.discountPercent = req.body.discountPercent;
    if (typeof req.body.announcementText === "string") update.announcementText = req.body.announcementText;
    update.updatedAt = new Date();
    const s = await StoreSettings.findOneAndUpdate({ key: "main" }, update, { upsert: true, new: true });
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Public endpoint so frontend can read discount */
router.get("/public/settings", async (req, res) => {
  try {
    let s = await StoreSettings.findOne({ key: "main" });
    if (!s) s = { discountPercent: 10 };
    res.json({ discountPercent: s.discountPercent || 10 });
  } catch (err) {
    res.json({ discountPercent: 10 });
  }
});

/* ===============================
   ADMIN LOGISTICS FLAG
================================ */
router.put("/admin/logistics/:id", authAdmin, async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { handedToLogistics: !!req.body.handedToLogistics });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Orders are created via payment verification - see paymentRoutes */

/* ===============================
   GET MY ORDERS (CUSTOMER)
================================ */
router.get("/my-orders", authUser, async (req, res) => {
  try {
    const orders = await Order.find({ email: req.user.email }).sort({ date: -1 });
    res.json(orders);
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
    doc.text(`Date: ${new Date(order.date).toLocaleString("en-IN")}`);
    doc.text(`Customer: ${order.name}`);
    doc.text(`Phone: ${order.phone}`);
    doc.text(`Email: ${order.email || ""}`);
    doc.text(`Payment Method: ${order.payment}`);
    doc.text(`Total Amount: Rs. ${order.total}`);
    doc.moveDown();

    doc.fontSize(13).text("Delivery Address:");
    doc.fontSize(12);
    const addrParts = [
      order.doorNo && "Door No: " + order.doorNo,
      order.building && "Building: " + order.building,
      order.area && "Area: " + order.area,
      order.taluk && "Taluk: " + order.taluk,
      order.district && "District: " + order.district,
      order.state && "State: " + order.state,
      order.pincode && "Pincode: " + order.pincode,
      order.addressExtra && order.addressExtra
    ].filter(Boolean);
    if (addrParts.length) {
      addrParts.forEach(a => doc.text(a));
    } else if (order.address) {
      doc.text(order.address);
    }
    doc.moveDown();

    doc.fontSize(13).text("Products:");
    doc.fontSize(12);
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

module.exports = router;


router.put("/status/:id", authAdmin, async (req,res)=>{
  await Order.findByIdAndUpdate(req.params.id,{
    status:req.body.status
  });
  res.send("updated");
});

/* Cancel order & refund (customer; only Processing) */
router.post("/cancel/:orderId", authUser, async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId, email: req.user.email });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "Processing") return res.status(400).json({ error: "Only processing orders can be cancelled" });
    if (order.payment === "Online" && order.razorpayPaymentId && Razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
      await rzp.refunds.create({ payment_id: order.razorpayPaymentId, amount: Math.round(order.total * 100) });
    }
    order.status = "Cancelled";
    await order.save();
    res.json({ message: "Order cancelled and amount refunded" });
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
/* Low stock products */
router.get("/analytics/low-stock", authAdmin, async (req, res) => {
  try {
    const Product = require("../models/product");
    const lowStock = await Product.find({ $or: [{ stock: { $lte: 10 } }, { stock: { $exists: false } }] }).limit(20);
    res.json(lowStock);
  } catch (err) {
    res.status(500).json({ error: "Low stock fetch failed" });
  }
});

router.get("/analytics/products", authAdmin, async (req,res)=>{

  try{

    const data = await Order.aggregate([

      { $unwind:"$items" },

      { 
        $group:{
          _id:"$items.name",
          totalQty:{ $sum:"$items.quantity" },
          revenue:{ 
            $sum:{ $multiply:["$items.price","$items.quantity"] }
          }
        }
      },

      { $sort:{ totalQty:-1 } }

    ]);

    res.json(data);

  }catch(err){
    res.status(500).json({ error:"Product analytics error" });
  }

});


/* ===============================
   EXPORT ORDERS CSV (TALLY)
================================ */
const { Parser } = require("json2csv");

router.get("/export/csv", authAdmin, async (req,res)=>{

  try{

    const orders = await Order.find();

    const rows = [];

    orders.forEach(o=>{
      o.items.forEach(i=>{
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
          Status: o.status || "Processing"
        });
      });
    });

    const parser = new Parser();
    const csv = parser.parse(rows);

    res.setHeader("Content-Type","text/csv");
    res.setHeader("Content-Disposition","attachment; filename=orders.csv");

    res.send(csv);

  }catch(err){
    res.status(500).json({error:"CSV export failed"});
  }

});
