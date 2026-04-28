import aio_pika
import os
import json
import structlog

logger = structlog.get_logger()
connection = None
channel = None
exchange = None

async def init_rabbitmq():
    global connection, channel, exchange
    url = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost/")
    for attempt in range(10):
        try:
            connection = await aio_pika.connect_robust(url)
            channel = await connection.channel()
            exchange = await channel.declare_exchange("shopnest_events", aio_pika.ExchangeType.TOPIC, durable=True)
            logger.info("RabbitMQ connected (order-service)")
            return
        except Exception as e:
            logger.warning(f"RabbitMQ attempt {attempt+1} failed: {e}")
            import asyncio; await asyncio.sleep(3)
    raise RuntimeError("Could not connect to RabbitMQ")

async def publish_event(routing_key: str, payload: dict):
    if not exchange:
        return
    import datetime
    payload["timestamp"] = datetime.datetime.utcnow().isoformat()
    message = aio_pika.Message(
        body=json.dumps(payload).encode(),
        delivery_mode=aio_pika.DeliveryMode.PERSISTENT
    )
    await exchange.publish(message, routing_key=routing_key)
    logger.info(f"Event published: {routing_key}")

async def close_rabbitmq():
    global connection
    if connection:
        await connection.close()
