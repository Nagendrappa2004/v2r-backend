const mongoose = require("mongoose");

const storeSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "main" },
  discountPercent: { type: Number, default: 10 },
  allowCustomerOrderCancel: { type: Boolean, default: true },
  announcementText: { type: String, default: "" },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("StoreSettings", storeSettingsSchema);
