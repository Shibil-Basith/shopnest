const express = require('express');
const { body } = require('express-validator');
const inventoryController = require('../controllers/inventory.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/check', inventoryController.checkAvailability);
router.get('/', authenticate, authorize('admin'), inventoryController.listInventory);
router.get('/:productId', authenticate, inventoryController.getStock);
router.get('/:productId/transactions', authenticate, authorize('admin'), inventoryController.getTransactions);
router.post('/:productId/add', authenticate, authorize('admin'), [body('quantity').isInt({ min: 1 })], inventoryController.addStock);
router.patch('/:productId/adjust', authenticate, authorize('admin'), [body('quantity').isInt({ min: 0 })], inventoryController.adjustStock);

module.exports = router;
