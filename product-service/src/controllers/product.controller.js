const slugify = require('slugify');
const { validationResult } = require('express-validator');
const { getPool } = require('../db/database');
const { getRedis } = require('../cache/redis');
const { publishEvent } = require('../messaging/rabbitmq');
const logger = require('../utils/logger');

exports.listProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, brand, min_price, max_price, sort = 'created_at', order = 'DESC' } = req.query;
    const offset = (page - 1) * limit;
    const pool = getPool();

    let whereClause = ['p.is_active = true'];
    const params = [];
    let paramIdx = 1;

    if (category) { whereClause.push(`c.slug = $${paramIdx++}`); params.push(category); }
    if (brand) { whereClause.push(`p.brand ILIKE $${paramIdx++}`); params.push(`%${brand}%`); }
    if (min_price) { whereClause.push(`p.price >= $${paramIdx++}`); params.push(min_price); }
    if (max_price) { whereClause.push(`p.price <= $${paramIdx++}`); params.push(max_price); }

    const allowedSort = ['price', 'created_at', 'name'];
    const safeSort = allowedSort.includes(sort) ? sort : 'created_at';
    const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const sql = `
      SELECT p.id, p.name, p.slug, p.short_description, p.price, p.compare_price,
             p.sku, p.images, p.brand, p.is_featured, p.created_at,
             c.name AS category_name, c.slug AS category_slug,
             COALESCE(AVG(r.rating), 0) AS avg_rating,
             COUNT(r.id) AS review_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_reviews r ON p.id = r.product_id
      WHERE ${whereClause.join(' AND ')}
      GROUP BY p.id, c.name, c.slug
      ORDER BY p.${safeSort} ${safeOrder}
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(limit, offset);

    const result = await pool.query(sql, params);
    const countResult = await pool.query(`SELECT COUNT(*) FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE ${whereClause.join(' AND ')}`, params.slice(0, -2));

    res.json({
      products: result.rows,
      pagination: { total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(countResult.rows[0].count / limit) }
    });
  } catch (err) {
    next(err);
  }
};

exports.getProduct = async (req, res, next) => {
  try {
    const pool = getPool();
    const redis = getRedis();
    const cacheKey = `product:${req.params.id}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json({ product: JSON.parse(cached) });

    const result = await pool.query(`
      SELECT p.*, c.name AS category_name, c.slug AS category_slug,
             COALESCE(AVG(r.rating), 0) AS avg_rating, COUNT(r.id) AS review_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_reviews r ON p.id = r.product_id
      WHERE (p.id = $1 OR p.slug = $1) AND p.is_active = true
      GROUP BY p.id, c.name, c.slug
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const product = result.rows[0];
    await redis.setex(cacheKey, 300, JSON.stringify(product));
    res.json({ product });
  } catch (err) {
    next(err);
  }
};

exports.getFeatured = async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT p.id, p.name, p.slug, p.short_description, p.price, p.compare_price, p.images, p.brand
      FROM products p WHERE p.is_featured = true AND p.is_active = true LIMIT 12
    `);
    res.json({ products: result.rows });
  } catch (err) { next(err); }
};

exports.searchProducts = async (req, res, next) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query required' });
    const offset = (page - 1) * limit;
    const pool = getPool();
    const result = await pool.query(`
      SELECT p.id, p.name, p.slug, p.price, p.images, p.brand, c.name AS category_name
      FROM products p LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = true AND (
        p.name ILIKE $1 OR p.description ILIKE $1 OR p.brand ILIKE $1 OR $2 = ANY(p.tags)
      )
      LIMIT $3 OFFSET $4
    `, [`%${q}%`, q.toLowerCase(), limit, offset]);
    res.json({ products: result.rows, query: q });
  } catch (err) { next(err); }
};

exports.createProduct = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { name, description, short_description, price, compare_price, cost_price, sku, category_id, brand, weight, dimensions, images, tags, meta_title, meta_description } = req.body;
    const slug = slugify(name, { lower: true, strict: true }) + '-' + Date.now();
    const pool = getPool();

    const result = await pool.query(`
      INSERT INTO products (name, slug, description, short_description, price, compare_price, cost_price, sku, category_id, brand, weight, dimensions, images, tags, meta_title, meta_description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [name, slug, description, short_description, price, compare_price, cost_price, sku, category_id, brand, weight, JSON.stringify(dimensions || {}), JSON.stringify(images || []), tags || [], meta_title, meta_description]);

    const product = result.rows[0];
    await publishEvent('product.created', { productId: product.id, sku: product.sku, name: product.name });
    logger.info(`Product created: ${product.sku}`);
    res.status(201).json({ product });
  } catch (err) { next(err); }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const pool = getPool();
    const redis = getRedis();
    const { name, description, short_description, price, compare_price, sku, category_id, brand, images, tags, is_active } = req.body;
    const result = await pool.query(`
      UPDATE products SET
        name = COALESCE($1, name), description = COALESCE($2, description),
        short_description = COALESCE($3, short_description), price = COALESCE($4, price),
        compare_price = COALESCE($5, compare_price), sku = COALESCE($6, sku),
        category_id = COALESCE($7, category_id), brand = COALESCE($8, brand),
        images = COALESCE($9, images), tags = COALESCE($10, tags),
        is_active = COALESCE($11, is_active), updated_at = NOW()
      WHERE id = $12 RETURNING *
    `, [name, description, short_description, price, compare_price, sku, category_id, brand, images ? JSON.stringify(images) : null, tags, is_active, req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    await redis.del(`product:${req.params.id}`);
    res.json({ product: result.rows[0] });
  } catch (err) { next(err); }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const pool = getPool();
    await pool.query('UPDATE products SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Product deactivated' });
  } catch (err) { next(err); }
};

exports.toggleFeatured = async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query('UPDATE products SET is_featured = NOT is_featured WHERE id = $1 RETURNING id, name, is_featured', [req.params.id]);
    res.json({ product: result.rows[0] });
  } catch (err) { next(err); }
};

exports.getReviews = async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM product_reviews WHERE product_id = $1 ORDER BY created_at DESC', [req.params.id]);
    res.json({ reviews: result.rows });
  } catch (err) { next(err); }
};

exports.addReview = async (req, res, next) => {
  try {
    const { rating, title, body } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(422).json({ error: 'Rating must be between 1 and 5' });
    const pool = getPool();
    const result = await pool.query(`
      INSERT INTO product_reviews (product_id, user_id, user_name, rating, title, body)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [req.params.id, req.user.userId, req.user.email, rating, title, body]);
    res.status(201).json({ review: result.rows[0] });
  } catch (err) { next(err); }
};
