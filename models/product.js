const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({

  name:{
    type:String,
    required:true,
    unique:true,     // ✅ PREVENT DUPLICATES
    trim:true
  },

  price:Number,
  category:String,
  image:String,
  description:String,
  stock:{
    type:Number,
    default:0
  },

  /* Product availability (sheet-driven) */
  upcoming: {
    type: Boolean,
    default: false
  },

  /* Quantity/weight options – prices from Google Sheet (columns: 300g, 1kg) */
  priceByWeight: {
    "300g": { type: Number, default: 99 },
    "1kg": { type: Number, default: 329 }
  },

  createdAt:{
    type:Date,
    default:Date.now
  }

});

module.exports = mongoose.model("Product", productSchema);
