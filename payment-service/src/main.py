from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog

from .database import init_db
from .messaging import init_rabbitmq, close_rabbitmq
from .routers import payments

logger = structlog.get_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await init_rabbitmq()
    logger.info("Payment service started")
    yield
    await close_rabbitmq()

app = FastAPI(title="ShopNest Payment Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status": "ok", "service": "payment-service"}

@app.exception_handler(Exception)
async def exc_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception", error=str(exc))
    return JSONResponse(status_code=500, content={"error": "Internal server error"})

app.include_router(payments.router, prefix="/api/v1/payments", tags=["payments"])
