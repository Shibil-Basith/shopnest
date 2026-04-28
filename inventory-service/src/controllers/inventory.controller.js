const { validationResult } = require('express-validator');
const { getPool } = require('../db/database');
const { publishEvent } = require('../messaging/rabbitmq');
const logger = require('../utils/logger');

exports.getStock = async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM inventory WHERE product_id = $1', [req.params.productId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Inventory record not found' });
    res.json({ inventory: result.rows[0] });
  } catch (err) { next(err); }
};

exports.listInventory = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, low_stock } = req.query;
    const offset = (page - 1) * limit;
    const pool = getPool();
    let where = '';
    if (low_stock === 'true') where = 'WHERE quantity - reserved_quantity <= reorder_level';
    const result = await pool.query(`SELECT * FROM inventory ${where} ORDER BY updated_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    res.json({ inventory: result.rows, pagination: { page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) { next(err); }
};

exports.addStock = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { quantity, note, warehouse_location } = req.body;
    const pool = getPool();

    const inv = await pool.query('SELECT * FROM inventory WHERE product_id = $1', [req.params.productId]);
    if (inv.rows.length === 0) return res.status(404).json({ error: 'Inventory record not found' });

    const updated = await pool.query(
      'UPDATE inventory SET quantity = quantity + $1, warehouse_location = COALESCE($2, warehouse_location), updated_at = NOW() WHERE product_id = $3 RETURNING *',
      [quantity, warehouse_location, req.params.productId]
    );

    await pool.query(
      'INSERT INTO inventory_transactions (inventory_id, product_id, type, quantity, note) VALUES ($1, $2, $3, $4, $5)',
      [inv.rows[0].id, req.params.productId, 'stock_in', quantity, note]
    );

    await publishEvent('inventory.updated', { productId: req.params.productId, availableQuantity: updated.rows[0].quantity - updated.rows[0].reserved_quantity });
    logger.info(`Stock added for product ${req.params.productId}: +${quantity}`);
    res.json({ inventory: updated.rows[0] });
  } catch (err) { next(err); }
};

exports.adjustStock = async (req, res, next) => {
  try {
    const { quantity, note } = req.body;
    const pool = getPool();
    const inv = await pool.query('SELECT * FROM inventory WHERE product_id = $1', [req.params.productId]);
    if (inv.rows.length === 0) return res.status(404).json({ error: 'Inventory record not found' });

    const diff = quantity - inv.rows[0].quantity;
    const updated = await pool.query(
      'UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE product_id = $2 RETURNING *',
      [quantity, req.params.productId]
    );

    await pool.query(
      'INSERT INTO inventory_transactions (inventory_id, product_id, type, quantity, note) VALUES ($1, $2, $3, $4, $5)',
      [inv.rows[0].id, req.params.productId, 'adjustment', diff, note || 'Manual adjustment']
    );
    res.json({ inventory: updated.rows[0] });
  } catch (err) { next(err); }
};

exports.checkAvailability = async (req, res, next) => {
  try {
    const { productId, quantity } = req.query;
    const pool = getPool();
    const result = await pool.query(
      'SELECT quantity - reserved_quantity AS available FROM inventory WHERE product_id = $1',
      [productId]
    );
    if (result.rows.length === 0) return res.json({ available: false, quantity: 0 });
    const avail = result.rows[0].available;
    res.json({ available: avail >= parseInt(quantity || 1), availableQuantity: avail });
  } catch (err) { next(err); }
};

exports.getTransactions = async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM inventory_transactions WHERE product_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.params.productId]
    );
    res.json({ transactions: result.rows });
  } catch (err) { next(err); }
};
