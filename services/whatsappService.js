/**
 * WhatsApp notifications — configure via .env when ready.
 *
 * WHATSAPP_PROVIDER=meta | twilio | custom | none (default: none)
 *
 * Meta Cloud API:
 *   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
 *
 * Twilio:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886)
 *
 * Custom HTTP API (your provider webhook):
 *   WHATSAPP_API_URL, WHATSAPP_API_KEY (optional header)
 *   POST body: { to, message } or set WHATSAPP_API_BODY_TEMPLATE
 */

function normalizePhone(phone) {
  if (!phone) return "";
  let digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits;
  if (digits.startsWith("0")) digits = "91" + digits.slice(1);
  return digits;
}

function isConfigured() {
  const p = (process.env.WHATSAPP_PROVIDER || "none").toLowerCase();
  if (p === "none" || !p) return false;
  if (p === "meta") {
    return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  }
  if (p === "twilio") {
    return !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM
    );
  }
  if (p === "custom") {
    return !!process.env.WHATSAPP_API_URL;
  }
  return false;
}

async function sendViaMeta(to, message) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message }
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || data.message || `Meta API ${res.status}`);
  }
  return data;
}

async function sendViaTwilio(to, message) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  const body = new URLSearchParams({
    From: from,
    To: `whatsapp:+${to}`,
    Body: message
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Twilio API ${res.status}`);
  }
  return data;
}

async function sendViaCustom(to, message) {
  const url = process.env.WHATSAPP_API_URL;
  const headers = { "Content-Type": "application/json" };
  if (process.env.WHATSAPP_API_KEY) {
    headers.Authorization = `Bearer ${process.env.WHATSAPP_API_KEY}`;
    headers["X-API-Key"] = process.env.WHATSAPP_API_KEY;
  }

  const payload = { to, message, phone: to, text: message };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `WhatsApp API ${res.status}`);
  }
  return data;
}

/**
 * @param {string} phone - customer or admin phone
 * @param {string} message
 * @returns {{ sent: boolean, skipped?: boolean, error?: string }}
 */
async function sendWhatsAppMessage(phone, message) {
  if (!isConfigured()) {
    return { sent: false, skipped: true, reason: "WhatsApp not configured" };
  }

  const to = normalizePhone(phone);
  if (!to || to.length < 11) {
    return { sent: false, skipped: true, reason: "Invalid phone number" };
  }

  const provider = (process.env.WHATSAPP_PROVIDER || "").toLowerCase();

  try {
    if (provider === "meta") await sendViaMeta(to, message);
    else if (provider === "twilio") await sendViaTwilio(to, message);
    else if (provider === "custom") await sendViaCustom(to, message);
    else return { sent: false, skipped: true, reason: "Unknown WHATSAPP_PROVIDER" };

    return { sent: true, to };
  } catch (err) {
    console.warn("WhatsApp send failed:", err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = {
  normalizePhone,
  isConfigured,
  sendWhatsAppMessage
};
