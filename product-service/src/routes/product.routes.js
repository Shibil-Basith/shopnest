const express = require('express');
const { body, query } = require('express-validator');
const productController = require('../controllers/product.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Public
router.get('/', productController.listProducts);
router.get('/featured', productController.getFeatured);
router.get('/search', productController.searchProducts);
router.get('/:id', productController.getProduct);
router.get('/:id/reviews', productController.getReviews);

// Protected
router.post('/:id/reviews', authenticate, productController.addReview);

// Admin
router.post('/', authenticate, authorize('admin', 'vendor'),
  [
    body('name').notEmpty(),
    body('price').isFloat({ min: 0 }),
    body('sku').notEmpty(),
  ],
  productController.createProduct
);
router.put('/:id', authenticate, authorize('admin', 'vendor'), productController.updateProduct);
router.delete('/:id', authenticate, authorize('admin'), productController.deleteProduct);
router.patch('/:id/featured', authenticate, authorize('admin'), productController.toggleFeatured);

module.exports = router;
