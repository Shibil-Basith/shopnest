from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncpg
import aio_pika
import structlog
import os

from .database import init_db
from .messaging import init_rabbitmq, close_rabbitmq
from .routers import orders

logger = structlog.get_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    await init_rabbitmq()
    logger.info("Order service started")
    yield
    # Shutdown
    await close_rabbitmq()
    logger.info("Order service stopped")

app = FastAPI(
    title="ShopNest Order Service",
    description="Order management microservice",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "order-service"}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception", error=str(exc))
    return JSONResponse(status_code=500, content={"error": "Internal server error"})

app.include_router(orders.router, prefix="/api/v1/orders", tags=["orders"])
