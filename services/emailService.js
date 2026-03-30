const nodemailer = require("nodemailer");

function normalizeSecret(v) {
  return (v || "").toString().trim().replace(/\s+/g, "");
}

const GMAIL_USER_FINAL = normalizeSecret(process.env.GMAIL_USER || process.env.EMAIL_USER);
const GMAIL_APP_PASSWORD_FINAL = normalizeSecret(
  process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS
);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER_FINAL,
    pass: GMAIL_APP_PASSWORD_FINAL
  }
});

const FROM = `v2r Heritages <${GMAIL_USER_FINAL || "noreply@v2r.com"}>`;

async function sendOrderConfirmation(to, order) {
  if (!GMAIL_USER_FINAL || !GMAIL_APP_PASSWORD_FINAL) {
    console.warn("Email not configured. Skipping order confirmation.");
    return;
  }
  const itemsList = (order.items || []).map(i => `• ${i.name} x ${i.quantity} = ₹${i.price * i.quantity}`).join("<br>");
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `Order Confirmed - ${order.orderId} | v2r Heritages`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#482B19">Thank you for your order!</h2>
        <p><strong>Order ID:</strong> ${order.orderId}</p>
        <p><strong>Total:</strong> ₹ ${order.total}</p>
        <p><strong>Payment:</strong> ${order.payment || "Online"}</p>
        <hr>
        <h3>Items:</h3>
        ${itemsList}
        <hr>
        <p>Your order has been received and will be processed shortly.</p>
        <p>— v2r Heritages Team</p>
      </div>
    `
  });
}

async function sendOtpEmail(to, otp) {
  if (!GMAIL_USER_FINAL || !GMAIL_APP_PASSWORD_FINAL) {
    throw new Error("Email not configured. Set GMAIL_USER/GMAIL_APP_PASSWORD (or EMAIL_USER/EMAIL_PASS).");
  }
  await transporter.sendMail({
    from: FROM,
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

module.exports = { sendOrderConfirmation, sendOtpEmail };
