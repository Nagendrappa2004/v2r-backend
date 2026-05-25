const {
  sendOrderConfirmationToCustomer,
  sendOrderNotificationToAdmin
} = require("./emailService");
const { sendWhatsAppMessage, isConfigured: whatsappReady } = require("./whatsappService");

function formatItemsText(order) {
  return (order.items || [])
    .map(i => {
      const wt = i.weightKey ? ` (${i.weightKey})` : "";
      const qty = i.quantity || 1;
      const line = (i.price || 0) * qty;
      return `• ${i.name || "Item"}${wt} × ${qty} = ₹${line}`;
    })
    .join("\n");
}

function formatItemsHtml(order) {
  return (order.items || [])
    .map(i => {
      const wt = i.weightKey ? ` (${i.weightKey})` : "";
      const qty = i.quantity || 1;
      const line = (i.price || 0) * qty;
      return `<tr><td style="padding:6px 0">${i.name || "Item"}${wt}</td><td align="center">${qty}</td><td align="right">₹${line}</td></tr>`;
    })
    .join("");
}

function buildCustomerWhatsAppMessage(order) {
  const items = formatItemsText(order);
  let msg =
    `✅ *Order Confirmed — v2r Heritages*\n\n` +
    `Order ID: *${order.orderId}*\n` +
    `Name: ${order.name}\n`;

  if (order.subtotal != null) {
    msg += `Subtotal: ₹${order.subtotal}\n`;
    msg += `Delivery: ${order.deliveryCharge === 0 ? "FREE" : "₹" + order.deliveryCharge}\n`;
  }
  msg +=
    `*Total: ₹${order.total}*\n` +
    `Payment: ${order.payment || "Online"}\n\n` +
    `*Items:*\n${items}\n\n`;

  if (order.address) msg += `*Delivery address:*\n${order.address}\n\n`;
  msg += `Thank you! We will process your order shortly.\n— v2r Heritages`;

  return msg;
}

function buildAdminWhatsAppMessage(order) {
  const items = formatItemsText(order);
  return (
    `🛒 *New order — v2r Heritages*\n\n` +
    `Order ID: *${order.orderId}*\n` +
    `Customer: ${order.name}\n` +
    `Phone: ${order.phone}\n` +
    `Email: ${order.email || "—"}\n` +
    `Total: ₹${order.total}\n` +
    `Payment: ${order.payment || "Online"}\n\n` +
    `*Items:*\n${items}\n\n` +
    `*Address:*\n${order.address || "—"}`
  );
}

/**
 * Send all post-order notifications (email + WhatsApp). Failures are logged, order still succeeds.
 */
async function notifyOrderPlaced(order) {
  const result = {
    emailCustomer: { sent: false },
    emailAdmin: { sent: false },
    whatsappCustomer: { sent: false },
    whatsappAdmin: { sent: false }
  };

  const customerEmail = order.email;
  const customerPhone = order.phone;
  const adminPhone =
    process.env.WHATSAPP_ADMIN_NUMBER ||
    process.env.WHATSAPP_SELLER_NUMBER ||
    process.env.STORE_PHONE ||
    "918088411798";

  const tasks = [];

  if (customerEmail) {
    tasks.push(
      sendOrderConfirmationToCustomer(customerEmail, order)
        .then(() => {
          result.emailCustomer = { sent: true };
        })
        .catch(err => {
          result.emailCustomer = { sent: false, error: err.message };
          console.warn("Customer order email failed:", err.message);
        })
    );
  } else {
    result.emailCustomer = { sent: false, skipped: true, reason: "No customer email" };
  }

  tasks.push(
    sendOrderNotificationToAdmin(order)
      .then(() => {
        result.emailAdmin = { sent: true };
      })
      .catch(err => {
        result.emailAdmin = { sent: false, error: err.message };
        console.warn("Admin order email failed:", err.message);
      })
  );

  if (customerPhone) {
    tasks.push(
      sendWhatsAppMessage(customerPhone, buildCustomerWhatsAppMessage(order)).then(r => {
        result.whatsappCustomer = r;
      })
    );
  } else {
    result.whatsappCustomer = { sent: false, skipped: true, reason: "No customer phone" };
  }

  if (process.env.WHATSAPP_NOTIFY_ADMIN !== "false") {
    tasks.push(
      sendWhatsAppMessage(adminPhone, buildAdminWhatsAppMessage(order)).then(r => {
        result.whatsappAdmin = r;
      })
    );
  } else {
    result.whatsappAdmin = { sent: false, skipped: true, reason: "WHATSAPP_NOTIFY_ADMIN=false" };
  }

  await Promise.all(tasks);

  if (!whatsappReady()) {
    console.info(
      "WhatsApp: not configured. Set WHATSAPP_PROVIDER and API keys in .env to enable auto messages."
    );
  }

  return result;
}

module.exports = {
  notifyOrderPlaced,
  formatItemsText,
  formatItemsHtml,
  buildCustomerWhatsAppMessage,
  buildAdminWhatsAppMessage
};
