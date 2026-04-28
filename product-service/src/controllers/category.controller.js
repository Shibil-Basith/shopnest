const slugify = require('slugify');
const { validationResult } = require('express-validator');
const { getPool } = require('../db/database');
const logger = require('../utils/logger');

exports.listCategories = async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM categories WHERE is_active = true ORDER BY name ASC');
    res.json({ categories: result.rows });
  } catch (err) { next(err); }
};

exports.getCategoryBySlug = async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM categories WHERE slug = $1', [req.params.slug]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Category not found' });
    res.json({ category: result.rows[0] });
  } catch (err) { next(err); }
};

exports.createCategory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    const { name, description, image_url, parent_id } = req.body;
    const slug = slugify(name, { lower: true, strict: true });
    const pool = getPool();
    const result = await pool.query(
      'INSERT INTO categories (name, slug, description, image_url, parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, slug, description, image_url, parent_id || null]
    );
    res.status(201).json({ category: result.rows[0] });
  } catch (err) { next(err); }
};

exports.updateCategory = async (req, res, next) => {
  try {
    const { name, description, image_url, is_active } = req.body;
    const pool = getPool();
    const result = await pool.query(`
      UPDATE categories SET
        name = COALESCE($1, name), description = COALESCE($2, description),
        image_url = COALESCE($3, image_url), is_active = COALESCE($4, is_active),
        updated_at = NOW()
      WHERE id = $5 RETURNING *
    `, [name, description, image_url, is_active, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Category not found' });
    res.json({ category: result.rows[0] });
  } catch (err) { next(err); }
};

exports.deleteCategory = async (req, res, next) => {
  try {
    const pool = getPool();
    await pool.query('UPDATE categories SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Category deactivated' });
  } catch (err) { next(err); }
};
