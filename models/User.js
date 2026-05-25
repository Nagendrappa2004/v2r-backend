const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,

  // added role without changing old logic
  role: {
    type: String,
    default: "user"   // user | admin
  },
  blocked: {
    type: Boolean,
    default: false
  },

  addresses: [{
    name: String,
    phone: String,
    address: String,       // full formatted address string
    city: String,
    state: String,
    pincode: String,
    doorNo: String,
    building: String,
    area: String,
    taluk: String,
    district: String,
    extra: String,
    isDefault: { type: Boolean, default: false }
  }],

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("User", userSchema);

