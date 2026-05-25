/** ₹40 per kg per pack (rounded up per unit). Free when subtotal ≥ ₹2000 */
const DELIVERY_PER_KG = 40;
const FREE_DELIVERY_MIN = 2000;

function parseWeightToKg(weightKey) {
  if (!weightKey) return 1;
  const s = String(weightKey).toLowerCase().trim().replace(/\s+/g, "");
  const kg = s.match(/^([\d.]+)kg$/);
  if (kg) return parseFloat(kg[1]) || 0;
  const g = s.match(/^([\d.]+)g$/);
  if (g) return (parseFloat(g[1]) || 0) / 1000;
  const ml = s.match(/^([\d.]+)ml$/);
  if (ml) return (parseFloat(ml[1]) || 0) / 1000;
  return 1;
}

function calcDeliveryCharge(subtotal, items) {
  if (subtotal >= FREE_DELIVERY_MIN) return 0;
  let charge = 0;
  for (const item of items || []) {
    const kg = parseWeightToKg(item.weightKey);
    const qty = item.quantity || 1;
    charge += Math.ceil(kg) * DELIVERY_PER_KG * qty;
  }
  return charge;
}

function calcSubtotal(items) {
  return (items || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
}

function calcOrderTotals(items) {
  const subtotal = calcSubtotal(items);
  const deliveryCharge = calcDeliveryCharge(subtotal, items);
  return { subtotal, deliveryCharge, total: subtotal + deliveryCharge };
}

module.exports = {
  DELIVERY_PER_KG,
  FREE_DELIVERY_MIN,
  parseWeightToKg,
  calcDeliveryCharge,
  calcSubtotal,
  calcOrderTotals
};
