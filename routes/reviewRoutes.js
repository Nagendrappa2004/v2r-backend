const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const { authUser } = require("../middleware/auth");

/* ADD REVIEW (LOGIN REQUIRED) */
router.post("/", authUser, async (req,res)=>{
  try{
    const body = { ...req.body, email: req.user.email };
    if (body.productId != null) body.productId = String(body.productId);
    const User = require("../models/User");
    const user = await User.findById(req.user.id);
    if (user) body.name = user.name;
    if (!body.productId) return res.status(400).json({ error: "productId required" });
    const review = new Review(body);
    await review.save();
    res.json({message:"Review saved"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

/* GET REVIEWS BY PRODUCT */
router.get("/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.json([]);
    const reviews = await Review.find({ productId: id }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    console.error("Reviews fetch:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
