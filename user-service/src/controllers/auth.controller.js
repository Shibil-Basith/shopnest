const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { validationResult } = require('express-validator');
const { getPool } = require('../db/database');
const { getRedis } = require('../cache/redis');
const { publishEvent } = require('../messaging/rabbitmq');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function generateTokens(userId, email, role) {
  const accessToken = jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { accessToken, refreshToken };
}

exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { email, password, first_name, last_name, phone } = req.body;
    const pool = getPool();

    // Check existing
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, first_name, last_name, role, created_at`,
      [email, password_hash, first_name, last_name, phone || null]
    );

    const user = result.rows[0];
    const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);

    // Store refresh token
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    // Publish event
    await publishEvent('user.registered', {
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
    });

    logger.info(`New user registered: ${user.email}`);

    res.status(201).json({
      message: 'Registration successful',
      user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role },
      tokens: { accessToken, refreshToken },
    });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { email, password } = req.body;
    const pool = getPool();
    const redis = getRedis();

    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, role, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);

    // Revoke old refresh tokens
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);

    // Store new refresh token
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    // Cache user session
    await redis.setex(`session:${user.id}`, 900, JSON.stringify({ userId: user.id, email: user.email, role: user.role }));

    logger.info(`User logged in: ${user.email}`);

    res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role },
      tokens: { accessToken, refreshToken },
    });
  } catch (err) {
    next(err);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const pool = getPool();
    const tokenRecord = await pool.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND token = $2 AND expires_at > NOW()',
      [decoded.userId, refreshToken]
    );

    if (tokenRecord.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token expired or invalid' });
    }

    const userResult = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [decoded.userId]);
    const user = userResult.rows[0];

    const tokens = generateTokens(user.id, user.email, user.role);

    await pool.query(
      'UPDATE refresh_tokens SET token = $1, expires_at = NOW() + INTERVAL \'7 days\' WHERE user_id = $2',
      [tokens.refreshToken, user.id]
    );

    res.json({ tokens });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const pool = getPool();
    const redis = getRedis();
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.userId]);
    await redis.del(`session:${req.user.userId}`);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

exports.verifyToken = async (req, res) => {
  res.json({ valid: true, user: req.user });
};

exports.changePassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { current_password, new_password } = req.body;
    const pool = getPool();

    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.userId]);
    const user = result.rows[0];

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const new_hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [new_hash, req.user.userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};
