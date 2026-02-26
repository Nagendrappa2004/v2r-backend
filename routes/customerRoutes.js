const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Order = require("../models/Order");
const { authAdmin } = require("../middleware/auth");

/* Protect all customer routes */
router.use(authAdmin);

/* GET ALL CUSTOMERS */
router.get("/", async (req, res) => {
  try {
    const users = await User.find({ role: "user" });
    const result = [];

    for (const u of users) {
      const orders = await Order.find({ email: u.email });
      const totalSpent = orders.reduce((s, o) => s + o.total, 0);
      result.push({
        _id: u._id,
        name: u.name,
        email: u.email,
        orders: orders.length,
        spent: totalSpent,
        blocked: u.blocked
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* BLOCK / UNBLOCK */
router.put("/block/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.blocked = !user.blocked;
    await user.save();
    res.json({ message: "Updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
