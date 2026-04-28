const { Pool } = require('pg');
const logger = require('../utils/logger');
let pool;

async function initDB() {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost', port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'inventorydb', user: process.env.DB_USER || 'inventoryservice',
    password: process.env.DB_PASSWORD || 'inventorypass123', max: 20,
  });
  const client = await pool.connect();
  logger.info('PostgreSQL connected (inventory-service)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS inventory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID UNIQUE NOT NULL,
      sku VARCHAR(100) UNIQUE NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
      reorder_level INTEGER DEFAULT 10,
      reorder_quantity INTEGER DEFAULT 50,
      warehouse_location VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
      product_id UUID NOT NULL,
      type VARCHAR(30) NOT NULL CHECK (type IN ('stock_in', 'stock_out', 'reserve', 'release', 'adjustment')),
      quantity INTEGER NOT NULL,
      reference_id UUID,
      reference_type VARCHAR(50),
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
    CREATE INDEX IF NOT EXISTS idx_transactions_inventory ON inventory_transactions(inventory_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_reference ON inventory_transactions(reference_id);
  `);
  client.release();
  logger.info('Inventory service tables initialized');
}

function getPool() { return pool; }
module.exports = { initDB, getPool };
