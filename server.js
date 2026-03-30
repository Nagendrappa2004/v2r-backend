require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
app.set("trust proxy", 1);

/* ===============================
   CREATE UPLOAD FOLDER
================================ */
const uploadsDir = path.join(__dirname, "uploads", "reviews");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/* ===============================
   MIDDLEWARE (MUST BE FIRST)
================================ */
app.use(cors());
app.use(express.json());

/* ===============================
   DATABASE CONNECTION
================================ */
mongoose.connect(
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/homeStore"
)
.then(() => console.log("MongoDB connected"))
.catch(err => console.log(err));

/* ===============================
   MODELS
================================ */
const Product = require("./models/product");
const Order = require("./models/Order");
const { authAdmin } = require("./middleware/auth");

/* ===============================
   ROUTES
================================ */

/* AUTH ROUTES */
const authRoutes = require("./routes/authRoutes");
app.use("/auth", authRoutes);

/* ORDER ROUTES */
const orderRoutes = require("./routes/orderRoutes");
app.use("/orders", orderRoutes);

/* PAYMENT ROUTES */
const paymentRoutes = require("./routes/paymentRoutes");
app.use("/payment", paymentRoutes);

app.get("/payment/config", (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID || "" });
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

/* UPLOADED FILES STATIC */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* PRODUCT ROUTES */
app.get("/products", async (req, res) => {
  const products = await Product.find();
  res.json(products);
});

/* PUBLIC: Top selling among LIVE products (excludes cancelled orders & upcoming SKUs) */
app.get("/public/top-selling", async (req, res) => {
  try {
    const data = await Order.aggregate([
      { $match: { status: { $ne: "Cancelled" } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: {
            $cond: [
              {
                $and: [
                  { $ne: ["$items.id", null] },
                  { $ne: ["$items.id", ""] }
                ]
              },
              { $toString: "$items.id" },
              { $ifNull: ["$items.name", "unknown"] }
            ]
          },
          totalQty: { $sum: { $ifNull: ["$items.quantity", 1] } },
          name: { $first: "$items.name" }
        }
      },
      { $sort: { totalQty: -1 } },
      { $limit: 12 }
    ]);

    for (const row of data) {
      const rawId = row && row._id;
      const productId =
        rawId && /^[a-f0-9]{24}$/i.test(String(rawId)) ? String(rawId) : "";
      const name = row?.name || (productId ? "" : String(rawId || ""));
      let upcoming = false;
      if (productId) {
        const p = await Product.findById(productId).select("upcoming");
        upcoming = !!(p && p.upcoming);
      } else if (name) {
        const p = await Product.findOne({ name }).select("upcoming");
        upcoming = !!(p && p.upcoming);
      }
      if (!upcoming && (productId || name)) {
        return res.json({
          productId,
          name,
          qty: row.totalQty || 0
        });
      }
    }
    res.json({ productId: "", name: "", qty: 0 });
  } catch (err) {
    res.json({ productId: "", name: "", qty: 0 });
  }
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

/* ROOT TEST ROUTE */
app.get("/", (req, res) => {
  res.send("V2R Backend is running 🚀");
});

/* ===============================
   STATIC FRONTEND (OPTIONAL)
================================ */
app.use(express.static("../frontend"));

/* ===============================
   START SERVER (MUST BE LAST)
================================ */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});