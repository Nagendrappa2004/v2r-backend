const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  productId: String,
  name: String,
  email: String,
  rating: Number,
  comment: String,
  image: String,     // ✅ STORES CLOUDINARY IMAGE
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Review", reviewSchema);
