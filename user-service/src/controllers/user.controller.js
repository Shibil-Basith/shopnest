const { validationResult } = require('express-validator');
const { getPool } = require('../db/database');
const logger = require('../utils/logger');

exports.getProfile = async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, phone, role, is_active, is_verified, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { first_name, last_name, phone, avatar_url } = req.body;
    const pool = getPool();

    const result = await pool.query(
      `UPDATE users 
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           phone = COALESCE($3, phone),
           avatar_url = COALESCE($4, avatar_url),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, email, first_name, last_name, phone, role, avatar_url, updated_at`,
      [first_name, last_name, phone, avatar_url, req.user.userId]
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

exports.getAddresses = async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
      [req.user.userId]
    );
    res.json({ addresses: result.rows });
  } catch (err) {
    next(err);
  }
};

exports.addAddress = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { label, street, city, state, country, postal_code, is_default } = req.body;
    const pool = getPool();

    if (is_default) {
      await pool.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [req.user.userId]);
    }

    const result = await pool.query(
      `INSERT INTO addresses (user_id, label, street, city, state, country, postal_code, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.userId, label || 'home', street, city, state, country, postal_code, is_default || false]
    );

    res.status(201).json({ address: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

exports.deleteAddress = async (req, res, next) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM addresses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    res.json({ message: 'Address deleted' });
  } catch (err) {
    next(err);
  }
};

exports.getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const pool = getPool();

    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, is_active, created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    const count = await pool.query('SELECT COUNT(*) FROM users');

    res.json({ users: result.rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, phone, role, is_active, is_verified, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

exports.toggleUserStatus = async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'UPDATE users SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, email, is_active',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
};
