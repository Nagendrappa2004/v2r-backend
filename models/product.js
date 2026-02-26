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

  /* Quantity/weight options – prices from Google Sheet (columns: 250g, 500g, 1kg) */
  priceByWeight: {
    "250g": { type: Number, default: 99 },
    "500g": { type: Number, default: 179 },
    "1kg": { type: Number, default: 329 }
  },

  createdAt:{
    type:Date,
    default:Date.now
  }

});

module.exports = mongoose.model("Product", productSchema);
