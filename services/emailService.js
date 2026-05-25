const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
  }
  return transporter;
}

const FROM = () => `v2r Heritages <${process.env.GMAIL_USER || "noreply@v2rheritages.com"}>`;

function isEmailConfigured() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
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

function buildOrderEmailHtml(order, title) {
  const rows = formatItemsHtml(order);
  const deliveryRow =
    order.deliveryCharge != null
      ? `<p><strong>Delivery:</strong> ${order.deliveryCharge === 0 ? "FREE" : "₹ " + order.deliveryCharge}</p>`
      : "";
  const subtotalRow =
    order.subtotal != null ? `<p><strong>Subtotal:</strong> ₹ ${order.subtotal}</p>` : "";

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#482B19;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
        <h2 style="margin:0;font-size:20px">${title}</h2>
      </div>
      <div style="border:1px solid #e8e0d8;border-top:none;padding:20px;border-radius:0 0 12px 12px">
        <p><strong>Order ID:</strong> ${order.orderId}</p>
        <p><strong>Customer:</strong> ${order.name || "—"}</p>
        <p><strong>Phone:</strong> ${order.phone || "—"}</p>
        ${subtotalRow}
        ${deliveryRow}
        <p><strong>Total:</strong> ₹ ${order.total}</p>
        <p><strong>Payment:</strong> ${order.payment || "Online"}</p>
        ${order.address ? `<p><strong>Address:</strong><br>${order.address}</p>` : ""}
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
          <tr style="color:#666"><th align="left">Item</th><th align="center">Qty</th><th align="right">Amount</th></tr>
          ${rows}
        </table>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <p style="color:#555;font-size:14px">Thank you for choosing v2r Heritages.</p>
        <p style="color:#888;font-size:12px">— v2r Heritages Team</p>
      </div>
    </div>
  `;
}

async function sendOrderConfirmationToCustomer(to, order) {
  const transport = getTransporter();
  if (!transport) {
    console.warn("Email not configured. Skipping customer order confirmation.");
    return { sent: false, skipped: true };
  }
  await transport.sendMail({
    from: FROM(),
    to,
    subject: `Order Confirmed - ${order.orderId} | v2r Heritages`,
    html: buildOrderEmailHtml(order, "Thank you for your order!")
  });
  return { sent: true };
}

async function sendOrderNotificationToAdmin(order) {
  const transport = getTransporter();
  const adminTo =
    process.env.ADMIN_ORDER_EMAIL ||
    process.env.ADMIN_EMAIL ||
    process.env.GMAIL_USER;

  if (!transport || !adminTo) {
    return { sent: false, skipped: true };
  }

  await transport.sendMail({
    from: FROM(),
    to: adminTo,
    subject: `New Order ${order.orderId} - ₹${order.total} | v2r Heritages`,
    html: buildOrderEmailHtml(order, "New order received")
  });
  return { sent: true };
}

/** @deprecated use sendOrderConfirmationToCustomer */
async function sendOrderConfirmation(to, order) {
  return sendOrderConfirmationToCustomer(to, order);
}

async function sendOtpEmail(to, otp) {
  const transport = getTransporter();
  if (!transport) {
    throw new Error("Email not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.");
  }
  await transport.sendMail({
    from: FROM(),
    to,
    subject: "Password Reset OTP - v2r Heritages",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
        <h2 style="color:#482B19">Password Reset</h2>
        <p>Your OTP is: <strong style="font-size:24px;letter-spacing:4px">${otp}</strong></p>
        <p>Valid for 5 minutes. Do not share with anyone.</p>
        <p>— v2r Heritages Team</p>
      </div>
    `
  });
}

module.exports = {
  isEmailConfigured,
  sendOrderConfirmation,
  sendOrderConfirmationToCustomer,
  sendOrderNotificationToAdmin,
  sendOtpEmail
};
