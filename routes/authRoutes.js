const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { authUser } = require("../middleware/auth");
const { OAuth2Client } = require("google-auth-library");

let googleClient = null;
function getGoogleClient() {
  if (!googleClient && process.env.GOOGLE_CLIENT_ID) {
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

/* REGISTER */
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "fallback-secret",
      { expiresIn: "7d" }
    );

    const safeUser = { _id: user._id, name: user.name, email: user.email, role: user.role };
    res.json({ message: "Registration successful", user: safeUser, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* LOGIN - Supports legacy plaintext passwords (upgrades to bcrypt on success) */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (user.blocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    let valid = false;
    const isBcryptHash = user.password && (user.password.startsWith("$2a$") || user.password.startsWith("$2b$"));
    if (isBcryptHash) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      valid = password === user.password;
      if (valid) {
        user.password = await bcrypt.hash(password, 10);
        await user.save();
      }
    }
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "fallback-secret",
      { expiresIn: "7d" }
    );

    const safeUser = { _id: user._id, name: user.name, email: user.email, role: user.role };
    res.json({ message: "Login successful", user: safeUser, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* FORGOT PASSWORD - Send OTP to email */
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No account found with this email" });
    }
    const Otp = require("../models/Otp");
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    await Otp.deleteMany({ email });
    await Otp.create({
      email,
      otp,
      purpose: "password_reset",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });
    const { sendOtpEmail } = require("../services/emailService");
    await sendOtpEmail(email, otp);
    res.json({ message: "OTP sent to your email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to send OTP" });
  }
});

/* VERIFY OTP AND RESET PASSWORD */
router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const Otp = require("../models/Otp");
    const record = await Otp.findOne({ email, otp });
    if (!record) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    if (new Date() > record.expiresAt) {
      await Otp.deleteOne({ _id: record._id });
      return res.status(400).json({ message: "OTP expired" });
    }
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    await Otp.deleteMany({ email });
    res.json({ message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GOOGLE LOGIN - using Google ID token */
router.get("/google-config", (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || "" });
});

router.post("/google", async (req, res) => {
  const { idToken } = req.body;
  try {
    const client = getGoogleClient();
    if (!client) {
      return res.status(500).json({ message: "Google login not configured (missing GOOGLE_CLIENT_ID)" });
    }
    if (!idToken) {
      return res.status(400).json({ message: "Missing Google ID token" });
    }
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name || (email ? email.split("@")[0] : "User");
    if (!email) return res.status(400).json({ message: "Unable to read Google email" });

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ name, email, password: "", role: "user" });
      await user.save();
    }
    if (user.blocked) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "fallback-secret",
      { expiresIn: "7d" }
    );

    const safeUser = { _id: user._id, name: user.name, email: user.email, role: user.role };
    res.json({ message: "Login successful", user: safeUser, token });
  } catch (err) {
    console.error("Google login error:", err);
    res.status(500).json({ message: "Google login failed" });
  }
});

/* ========== ADDRESSES (logged-in user) ========== */
router.get("/addresses", authUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json(user.addresses || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/addresses", authUser, async (req, res) => {
  try {
    const {
      name,
      phone,
      address,
      city,
      state,
      pincode,
      doorNo,
      building,
      area,
      taluk,
      district,
      extra,
      isDefault
    } = req.body;
    if (!name || !phone || !address) return res.status(400).json({ message: "Name, phone and address required" });
    const user = await User.findById(req.user.id);
    if (!user.addresses) user.addresses = [];
    const newAddr = {
      name,
      phone,
      address,
      city: city || "",
      state: state || "",
      pincode: pincode || "",
      doorNo: doorNo || "",
      building: building || "",
      area: area || "",
      taluk: taluk || "",
      district: district || "",
      extra: extra || "",
      isDefault: !!isDefault
    };
    if (isDefault) user.addresses.forEach(a => { a.isDefault = false; });
    user.addresses.push(newAddr);
    await user.save();
    res.json(user.addresses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/addresses/:index", authUser, async (req, res) => {
  try {
    const i = parseInt(req.params.index, 10);
    const user = await User.findById(req.user.id);
    if (!user.addresses || i < 0 || i >= user.addresses.length) return res.status(400).json({ message: "Invalid index" });
    const {
      name,
      phone,
      address,
      city,
      state,
      pincode,
      doorNo,
      building,
      area,
      taluk,
      district,
      extra,
      isDefault
    } = req.body;
    if (name != null) user.addresses[i].name = name;
    if (phone != null) user.addresses[i].phone = phone;
    if (address != null) user.addresses[i].address = address;
    if (city != null) user.addresses[i].city = city;
    if (state != null) user.addresses[i].state = state;
    if (pincode != null) user.addresses[i].pincode = pincode;
    if (doorNo != null) user.addresses[i].doorNo = doorNo;
    if (building != null) user.addresses[i].building = building;
    if (area != null) user.addresses[i].area = area;
    if (taluk != null) user.addresses[i].taluk = taluk;
    if (district != null) user.addresses[i].district = district;
    if (extra != null) user.addresses[i].extra = extra;
    if (isDefault === true) { user.addresses.forEach(a => { a.isDefault = false; }); user.addresses[i].isDefault = true; }
    await user.save();
    res.json(user.addresses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/addresses/:index", authUser, async (req, res) => {
  try {
    const i = parseInt(req.params.index, 10);
    const user = await User.findById(req.user.id);
    if (!user.addresses || i < 0 || i >= user.addresses.length) return res.status(400).json({ message: "Invalid index" });
    user.addresses.splice(i, 1);
    await user.save();
    res.json(user.addresses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
