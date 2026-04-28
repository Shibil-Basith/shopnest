import aio_pika, os, json, structlog, datetime, asyncio
logger = structlog.get_logger()
connection = channel = exchange = None

async def init_rabbitmq():
    global connection, channel, exchange
    url = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost/")
    for attempt in range(10):
        try:
            connection = await aio_pika.connect_robust(url)
            channel = await connection.channel()
            exchange = await channel.declare_exchange("shopnest_events", aio_pika.ExchangeType.TOPIC, durable=True)
            logger.info("RabbitMQ connected (payment-service)")
            return
        except Exception as e:
            logger.warning(f"RabbitMQ attempt {attempt+1} failed: {e}")
            await asyncio.sleep(3)
    raise RuntimeError("RabbitMQ connection failed")

async def publish_event(routing_key: str, payload: dict):
    if not exchange: return
    payload["timestamp"] = datetime.datetime.utcnow().isoformat()
    await exchange.publish(aio_pika.Message(body=json.dumps(payload).encode(), delivery_mode=aio_pika.DeliveryMode.PERSISTENT), routing_key=routing_key)

async def close_rabbitmq():
    if connection: await connection.close()
