const express = require('express');
const { body } = require('express-validator');
const categoryController = require('../controllers/category.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', categoryController.listCategories);
router.get('/:slug', categoryController.getCategoryBySlug);

router.post('/', authenticate, authorize('admin'),
  [body('name').notEmpty()],
  categoryController.createCategory
);
router.put('/:id', authenticate, authorize('admin'), categoryController.updateCategory);
router.delete('/:id', authenticate, authorize('admin'), categoryController.deleteCategory);

module.exports = router;
