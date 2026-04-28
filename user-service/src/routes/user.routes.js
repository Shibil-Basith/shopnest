const express = require('express');
const { body, param } = require('express-validator');
const userController = require('../controllers/user.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Get profile
router.get('/profile', authenticate, userController.getProfile);

// Update profile
router.put(
  '/profile',
  authenticate,
  [
    body('first_name').optional().trim().notEmpty(),
    body('last_name').optional().trim().notEmpty(),
    body('phone').optional().isMobilePhone(),
  ],
  userController.updateProfile
);

// Get addresses
router.get('/addresses', authenticate, userController.getAddresses);

// Add address
router.post(
  '/addresses',
  authenticate,
  [
    body('street').notEmpty(),
    body('city').notEmpty(),
    body('state').notEmpty(),
    body('country').notEmpty(),
    body('postal_code').notEmpty(),
  ],
  userController.addAddress
);

// Delete address
router.delete('/addresses/:id', authenticate, userController.deleteAddress);

// Admin routes
router.get('/', authenticate, authorize('admin'), userController.getAllUsers);
router.get('/:id', authenticate, authorize('admin'), userController.getUserById);
router.patch('/:id/status', authenticate, authorize('admin'), userController.toggleUserStatus);

module.exports = router;
