const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  price: Number,
  category: String,
  image: String,
  description: String,
  stock: { type: Number, default: 0 },
  upcoming: { type: Boolean, default: false },

  /* Dynamic quantity/weight pricing — keys are anything: 100g, 250ml, 1kg, etc.
     Supports any quantity labels the admin puts in the Google Sheet header */
  priceByWeight: {
    type: Map,
    of: Number
  },

  createdAt: { type: Date, default: Date.now }

});

module.exports = mongoose.model("Product", productSchema);
