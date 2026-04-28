const { Pool } = require('pg');
const logger = require('../utils/logger');

let pool;

async function initDB() {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'userdb',
    user: process.env.DB_USER || 'userservice',
    password: process.env.DB_PASSWORD || 'userpass123',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test connection
  const client = await pool.connect();
  logger.info('PostgreSQL connected (user-service)');

  // Create tables
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      role VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'vendor')),
      is_active BOOLEAN DEFAULT true,
      is_verified BOOLEAN DEFAULT false,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      label VARCHAR(50) DEFAULT 'home',
      street TEXT NOT NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      country VARCHAR(100) NOT NULL,
      postal_code VARCHAR(20) NOT NULL,
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
  `);

  client.release();
  logger.info('User service tables initialized');
}

function getPool() {
  return pool;
}

module.exports = { initDB, getPool };
