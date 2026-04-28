const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
  ],
  authController.register
);

// Login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  authController.login
);

// Refresh token
router.post('/refresh', authController.refreshToken);

// Logout
router.post('/logout', authenticate, authController.logout);

// Verify token (used by other services)
router.get('/verify', authenticate, authController.verifyToken);

// Change password
router.put(
  '/change-password',
  authenticate,
  [
    body('current_password').notEmpty(),
    body('new_password').isLength({ min: 8 }),
  ],
  authController.changePassword
);

module.exports = router;
