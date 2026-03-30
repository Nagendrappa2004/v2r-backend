const mongoose = require("mongoose");

const storeSettingsSchema = new mongoose.Schema(
  {
    /* When false, customers cannot cancel from My Orders (owner closed window) */
    allowCustomerOrderCancel: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const StoreSettings = mongoose.model("StoreSettings", storeSettingsSchema);

async function getStoreSettings() {
  let doc = await StoreSettings.findOne();
  if (!doc) {
    doc = await StoreSettings.create({});
  }
  return doc;
}

module.exports = StoreSettings;
module.exports.getStoreSettings = getStoreSettings;
