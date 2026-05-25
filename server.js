require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

const uploadsDir = path.join(__dirname, "uploads", "reviews");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

/* ===============================
   MIDDLEWARE (MUST BE FIRST)
================================ */
app.use(cors());
app.use(express.json());

/* ===============================
   DATABASE CONNECTION
================================ */
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/homeStore")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

/* ===============================
   MODELS
================================ */
const Product = require("./models/product");
const { authAdmin } = require("./middleware/auth");

/* ===============================
   ROUTES
================================ */

/* AUTH ROUTES (VERY IMPORTANT: BEFORE listen) */
const authRoutes = require("./routes/authRoutes");
app.use("/auth", authRoutes);

/* ORDER ROUTES */
const orderRoutes = require("./routes/orderRoutes");
app.use("/orders", orderRoutes);

/* PUBLIC SETTINGS (discount etc) - served via order routes */
/* Top-selling product for homepage badge */
app.get("/public/top-selling", async (req, res) => {
  try {
    const Order = require("./models/Order");
    const data = await Order.aggregate([
      { $match: { status: { $ne: "Cancelled" } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.name", productId: { $first: "$items.productId" }, qty: { $sum: "$items.quantity" } } },
      { $sort: { qty: -1 } },
      { $limit: 1 }
    ]);

    if (data.length) {
      res.json({
        name: data[0]._id,
        productId: data[0].productId,
        qty: data[0].qty
      });
    } else {
      res.json({});
    }
  } catch (err) {
    res.json({});
  }
});

/* PUBLIC SETTINGS - discount percentage */
app.get("/public/settings", async (req, res) => {
  try {
    const StoreSettings = require("./models/StoreSettings");
    let s = await StoreSettings.findOne({ key: "main" });

    res.json({
      discountPercent: s ? (s.discountPercent || 10) : 10
    });
  } catch (err) {
    res.json({ discountPercent: 10 });
  }
});

/* PAYMENT ROUTES */
const paymentRoutes = require("./routes/paymentRoutes");
app.use("/payment", paymentRoutes);

app.get("/payment/config", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID || "" });
});

app.get("/public/notification-config", (req, res) => {
  const { isEmailConfigured } = require("./services/emailService");
  const { isConfigured: whatsappConfigured } = require("./services/whatsappService");

  res.json({
    email: isEmailConfigured(),
    whatsapp: whatsappConfigured(),
    whatsappProvider: process.env.WHATSAPP_PROVIDER || "none"
  });
});

/* SHEET ROUTES */
const sheetRoutes = require("./routes/sheetRoutes");
app.use("/sheet", sheetRoutes);

/* CUSTOMER ROUTES */
const customerRoutes = require("./routes/customerRoutes");
app.use("/customers", customerRoutes);

/* REVIEW ROUTES */
const reviewRoutes = require("./routes/reviewRoutes");
app.use("/reviews", reviewRoutes);

/* UPLOAD ROUTES */
const uploadRoutes = require("./routes/uploadRoutes");
app.use("/upload", uploadRoutes);

/* CONTACT ROUTES */
const contactRoutes = require("./routes/contactRoutes");
app.use("/contact", contactRoutes);

/* UPLOADED FILES */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* PRODUCT ROUTES */
app.get("/products", async (req, res) => {
  const products = await Product.find();
  res.json(products);
});

app.post("/add-product", authAdmin, async (req, res) => {
  const product = new Product(req.body);
  await product.save();
  res.send("Product Added");
});

app.put("/update-product/:id", authAdmin, async (req, res) => {
  await Product.findByIdAndUpdate(req.params.id, {
    price: req.body.price,
    stock: req.body.stock
  });

  res.send("Updated");
});

app.put("/update-stock/:id", authAdmin, async (req, res) => {
  await Product.findByIdAndUpdate(req.params.id, {
    stock: Number(req.body.stock)
  });

  res.send("Stock Updated");
});

app.delete("/delete-product/:id", authAdmin, async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.send("Deleted");
});

/* ===============================
   STATIC FRONTEND (OPTIONAL)
================================ */
app.use(express.static("../frontend"));

/* ===============================
   ROOT ROUTE
================================ */
app.get("/", (req, res) => {
  res.send("Backend is running");
});

/* ===============================
   START SERVER (MUST BE LAST)
================================ */
app.listen(process.env.PORT || 5000, () => {
  console.log("Server running on port", process.env.PORT || 5000);
});