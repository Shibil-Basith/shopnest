import asyncpg
import os
import structlog

logger = structlog.get_logger()
pool = None

async def init_db():
    global pool
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://orderservice:orderpass123@localhost:5432/orderdb")
    
    for attempt in range(10):
        try:
            pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=20)
            break
        except Exception as e:
            logger.warning(f"DB connection attempt {attempt+1} failed: {e}")
            import asyncio; await asyncio.sleep(3)
    
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL,
                status VARCHAR(30) DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
                subtotal NUMERIC(12,2) NOT NULL,
                shipping_cost NUMERIC(12,2) DEFAULT 0,
                tax_amount NUMERIC(12,2) DEFAULT 0,
                discount_amount NUMERIC(12,2) DEFAULT 0,
                total_amount NUMERIC(12,2) NOT NULL,
                currency VARCHAR(3) DEFAULT 'INR',
                shipping_address JSONB NOT NULL,
                billing_address JSONB,
                payment_status VARCHAR(20) DEFAULT 'pending'
                    CHECK (payment_status IN ('pending','paid','failed','refunded')),
                payment_method VARCHAR(50),
                payment_reference VARCHAR(200),
                notes TEXT,
                estimated_delivery TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS order_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
                product_id UUID NOT NULL,
                sku VARCHAR(100) NOT NULL,
                name VARCHAR(255) NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                unit_price NUMERIC(12,2) NOT NULL,
                total_price NUMERIC(12,2) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS order_history (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
                status VARCHAR(30) NOT NULL,
                note TEXT,
                created_by UUID,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
            CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
            CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
        """)
    logger.info("Order service DB initialized")

def get_pool():
    return pool
