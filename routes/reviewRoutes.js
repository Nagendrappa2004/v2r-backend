const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const { authUser } = require("../middleware/auth");

/* ADD REVIEW (LOGIN REQUIRED) */
router.post("/", authUser, async (req,res)=>{
  try{
    const body = { ...req.body, email: req.user.email };
    const User = require("../models/User");
    const user = await User.findById(req.user.id);
    if (user) body.name = user.name;
    const review = new Review(body);
    await review.save();
    res.json({message:"Review saved"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

/* GET REVIEWS BY PRODUCT */
router.get("/:id", async (req,res)=>{
  const reviews = await Review.find({ productId:req.params.id })
                               .sort({createdAt:-1});
  res.json(reviews);
});

module.exports = router;
