/**
 * Creates admin user: owner@v2r.com / admin123
 * Run: node scripts/create-admin.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: { type: String, default: "user" },
  blocked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

async function createAdmin() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/homeStore";
  await mongoose.connect(uri);
  const hashedPassword = await bcrypt.hash("admin123", 10);
  await User.findOneAndUpdate(
    { email: "owner@v2r.com" },
    { name: "Admin", email: "owner@v2r.com", password: hashedPassword, role: "admin" },
    { upsert: true, new: true }
  );
  console.log("Admin created: owner@v2r.com / admin123");
  process.exit(0);
}

createAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
