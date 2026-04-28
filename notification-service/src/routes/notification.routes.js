const express = require('express');
const Notification = require('../models/notification.model');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { userId, status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    if (status) filter.status = status;
    const [notifications, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(parseInt(limit)).skip((page - 1) * limit),
      Notification.countDocuments(filter)
    ]);
    res.json({ notifications, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

router.get('/user/:userId', async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.params.userId }).sort({ createdAt: -1 }).limit(50);
    res.json({ notifications });
  } catch (err) { next(err); }
});

router.get('/stats', async (req, res, next) => {
  try {
    const stats = await Notification.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    res.json({ stats });
  } catch (err) { next(err); }
});

module.exports = router;
