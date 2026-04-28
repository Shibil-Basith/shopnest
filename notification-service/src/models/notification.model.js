const mongoose = require('mongoose');
const notificationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  type: { type: String, enum: ['email', 'sms', 'push'], default: 'email' },
  event: { type: String, required: true },
  recipient: { type: String, required: true },
  subject: String,
  body: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  metadata: { type: mongoose.Schema.Types.Mixed },
  sentAt: Date,
  errorMessage: String,
}, { timestamps: true });
module.exports = mongoose.model('Notification', notificationSchema);
