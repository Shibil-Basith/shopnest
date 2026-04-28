import asyncpg, os, structlog, asyncio
logger = structlog.get_logger()
pool = None

async def init_db():
    global pool
    url = os.getenv("DATABASE_URL", "postgresql://paymentservice:paymentpass123@localhost:5432/paymentdb")
    for attempt in range(10):
        try:
            pool = await asyncpg.create_pool(url, min_size=2, max_size=10)
            break
        except Exception as e:
            logger.warning(f"DB attempt {attempt+1} failed: {e}")
            await asyncio.sleep(3)

    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS payments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id UUID NOT NULL,
                user_id UUID NOT NULL,
                amount NUMERIC(12,2) NOT NULL,
                currency VARCHAR(3) DEFAULT 'INR',
                status VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','completed','failed','refunded')),
                method VARCHAR(50),
                gateway VARCHAR(50) DEFAULT 'mock',
                gateway_transaction_id VARCHAR(200),
                gateway_response JSONB,
                failure_reason TEXT,
                refund_amount NUMERIC(12,2),
                refund_reason TEXT,
                refunded_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
            CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
            CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
        """)
    logger.info("Payment service DB initialized")

def get_pool(): return pool
