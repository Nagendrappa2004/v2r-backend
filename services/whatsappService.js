function normalizeWhatsAppNumber(input) {
  const digits = (input || "").toString().replace(/\D/g, "");
  if (!digits) return "";

  // If already contains country code
  if (digits.startsWith("91")) return digits;
  // If 10 digits (typical India mobile)
  if (digits.length === 10) return "91" + digits;
  // If 11 digits starting with 0
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  // Fallback: return as-is (Meta will validate)
  return digits;
}

async function sendWhatsAppText(to, body) {
  const accessToken = process.env.META_WA_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return { ok: false, reason: "Meta WhatsApp not configured" };

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages?access_token=${encodeURIComponent(accessToken)}`;

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, data };
  return { ok: true, data };
}

async function sendOrderWhatsAppNotifications(order) {
  const businessNumber = normalizeWhatsAppNumber(process.env.BUSINESS_WHATSAPP_NUMBER);
  const customerNumber = normalizeWhatsAppNumber(order.phone);

  if (!businessNumber || !customerNumber) {
    return { ok: false, reason: "Missing business/customer phone numbers" };
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const itemsText = items
    .map(i => {
      const w = i.weightKey ? ` (${i.weightKey})` : "";
      const q = i.quantity || 1;
      return `- ${i.name}${w} x${q} = ₹${(Number(i.price) || 0) * q}`;
    })
    .join("\n");

  const addressText = order.address ? String(order.address) : "";

  const customerMsg =
    `Hi ${order.name || ""}, your order is confirmed.\n` +
    `Order ID: ${order.orderId}\n` +
    `Total: ₹ ${order.total}\n\n` +
    `Items:\n${itemsText}\n\n` +
    (addressText ? `Delivery Address:\n${addressText}\n\n` : "") +
    `Thanks for shopping v2r Heritages.`;

  const sellerMsg =
    `New Order Received\n` +
    `Order ID: ${order.orderId}\n` +
    `Customer: ${order.name || ""} (${order.phone || ""})\n` +
    `Total: ₹ ${order.total}\n\n` +
    `Items:\n${itemsText}\n\n` +
    (addressText ? `Delivery Address:\n${addressText}\n` : "");

  const [customerRes, sellerRes] = await Promise.all([
    sendWhatsAppText(customerNumber, customerMsg),
    sendWhatsAppText(businessNumber, sellerMsg)
  ]);

  return { ok: true, customerRes, sellerRes };
}

module.exports = { sendOrderWhatsAppNotifications };

