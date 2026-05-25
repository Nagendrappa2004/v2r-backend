const mongoose = require("mongoose");
const Product = require("../models/product");

function getItemProductId(item) {
  const raw = item.id || item._id || item.productId;
  if (!raw) return null;
  const s = String(raw).trim();
  if (mongoose.Types.ObjectId.isValid(s)) return s;
  return null;
}

async function findProductForOrderItem(item) {
  const pid = getItemProductId(item);
  if (pid) {
    const p = await Product.findById(pid);
    if (p) return p;
  }
  if (item.name) {
    const byName = await Product.findOne({ name: item.name });
    if (byName) return byName;
  }
  return null;
}

module.exports = { getItemProductId, findProductForOrderItem };
