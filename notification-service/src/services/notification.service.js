const nodemailer = require('nodemailer');
const Notification = require('../models/notification.model');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const templates = {
  'user.registered': (d) => ({ subject: 'Welcome to ShopNest! 🛍️', body: `Hi ${d.firstName},\n\nWelcome to ShopNest! Your account is ready.\n\nThe ShopNest Team` }),
  'order.placed': (d) => ({ subject: `Order Confirmed #${(d.orderId||'').slice(-8).toUpperCase()}`, body: `Your order has been placed!\n\nOrder ID: ${d.orderId}\nTotal: ₹${d.total}\n\nShopNest Team` }),
  'order.shipped': (d) => ({ subject: `Your Order is on the Way! 🚚`, body: `Order ${d.orderId} has been shipped. You'll receive it soon.\n\nShopNest Team` }),
  'order.delivered': (d) => ({ subject: `Order Delivered! ✅`, body: `Your order ${d.orderId} has been delivered. We hope you love it!\n\nShopNest Team` }),
  'order.cancelled': (d) => ({ subject: `Order Cancelled`, body: `Your order ${d.orderId} has been cancelled.\n\nShopNest Team` }),
  'payment.completed': (d) => ({ subject: `Payment Successful ✅`, body: `Payment of ₹${d.amount} received. Transaction: ${d.transactionId}\n\nShopNest Team` }),
  'payment.failed': (d) => ({ subject: `Payment Failed ❌`, body: `Payment failed. Reason: ${d.reason}\n\nPlease retry at shopnest.com\n\nShopNest Team` }),
  'payment.refunded': (d) => ({ subject: `Refund Processed 💰`, body: `Refund of ₹${d.amount} initiated. Allow 3-5 business days.\n\nShopNest Team` }),
};

async function handleEvent(eventKey, data) {
  const template = templates[eventKey];
  if (!template) return logger.warn(`No template for event: ${eventKey}`);

  const recipient = data.email || `user_${data.userId || 'unknown'}@shopnest.internal`;
  const { subject, body } = template(data);

  const notification = await Notification.create({
    userId: data.userId || 'system', type: 'email', event: eventKey,
    recipient, subject, body, metadata: data, status: 'pending',
  });

  try {
    const isRealSmtp = process.env.SMTP_USER && process.env.SMTP_PASS && !process.env.SMTP_PASS.includes('placeholder');
    if (isRealSmtp) {
      await transporter.sendMail({ from: `"ShopNest" <${process.env.SMTP_USER}>`, to: recipient, subject, text: body });
    } else {
      logger.info(`[MOCK EMAIL] To: ${recipient} | Subject: ${subject}`);
    }
    await Notification.findByIdAndUpdate(notification._id, { status: 'sent', sentAt: new Date() });
  } catch (err) {
    await Notification.findByIdAndUpdate(notification._id, { status: 'failed', errorMessage: err.message });
    logger.error(`Notification failed for ${eventKey}`, err.message);
  }
}

module.exports = { handleEvent };
