const { Pool } = require('pg');
const logger = require('../utils/logger');

let pool;

async function initDB() {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'productdb',
    user: process.env.DB_USER || 'productservice',
    password: process.env.DB_PASSWORD || 'productpass123',
    max: 20,
  });

  const client = await pool.connect();
  logger.info('PostgreSQL connected (product-service)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) UNIQUE NOT NULL,
      slug VARCHAR(120) UNIQUE NOT NULL,
      description TEXT,
      image_url TEXT,
      parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(280) UNIQUE NOT NULL,
      description TEXT,
      short_description VARCHAR(500),
      price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
      compare_price NUMERIC(12,2),
      cost_price NUMERIC(12,2),
      sku VARCHAR(100) UNIQUE NOT NULL,
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      brand VARCHAR(100),
      weight NUMERIC(8,3),
      dimensions JSONB,
      images JSONB DEFAULT '[]',
      tags TEXT[],
      is_active BOOLEAN DEFAULT true,
      is_featured BOOLEAN DEFAULT false,
      meta_title VARCHAR(255),
      meta_description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS product_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID REFERENCES products(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      user_name VARCHAR(200) NOT NULL,
      rating INTEGER CHECK (rating BETWEEN 1 AND 5),
      title VARCHAR(255),
      body TEXT,
      is_verified_purchase BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON product_reviews(product_id);
  `);

  // Seed default categories
  await client.query(`
    INSERT INTO categories (name, slug, description) VALUES
      ('Electronics', 'electronics', 'Gadgets, devices and tech accessories'),
      ('Clothing', 'clothing', 'Fashion for men, women and kids'),
      ('Home & Garden', 'home-garden', 'Furniture, decor and gardening'),
      ('Sports', 'sports', 'Sports equipment and activewear'),
      ('Books', 'books', 'Books, ebooks and audiobooks')
    ON CONFLICT (slug) DO NOTHING;
  `);

  client.release();
  logger.info('Product service tables initialized');
}

function getPool() { return pool; }

module.exports = { initDB, getPool };
