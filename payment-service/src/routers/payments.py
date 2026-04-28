from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from decimal import Decimal
import uuid, structlog, random, string

from ..database import get_pool
from ..messaging import publish_event
from ..auth import verify_token

router = APIRouter()
logger = structlog.get_logger()

class PaymentCreate(BaseModel):
    order_id: UUID
    amount: Decimal
    currency: str = "INR"
    method: str  # card, upi, netbanking, cod
    gateway_token: Optional[str] = None  # token from frontend payment widget

class RefundRequest(BaseModel):
    reason: str
    amount: Optional[Decimal] = None

def mock_gateway_charge(amount: float, method: str, token: Optional[str]):
    """Simulates a payment gateway. Replace with real Stripe/Razorpay SDK calls."""
    success = random.random() > 0.05  # 95% success rate
    txn_id = "TXN_" + "".join(random.choices(string.ascii_uppercase + string.digits, k=16))
    return {
        "success": success,
        "transaction_id": txn_id if success else None,
        "error": None if success else "Card declined",
        "gateway_response": {"amount": amount, "currency": "INR", "method": method}
    }

@router.post("/", status_code=201)
async def initiate_payment(payload: PaymentCreate, user = Depends(verify_token)):
    pool = get_pool()

    # Check for existing payment
    existing = await pool.fetchrow(
        "SELECT id, status FROM payments WHERE order_id = $1 AND status = 'completed'",
        payload.order_id
    )
    if existing:
        raise HTTPException(status_code=409, detail="Order already paid")

    # Create payment record
    payment = await pool.fetchrow("""
        INSERT INTO payments (order_id, user_id, amount, currency, method, status)
        VALUES ($1, $2, $3, $4, $5, 'processing') RETURNING *
    """, payload.order_id, UUID(user["userId"]), payload.amount, payload.currency, payload.method)

    # Process with mock gateway
    result = mock_gateway_charge(float(payload.amount), payload.method, payload.gateway_token)

    if result["success"]:
        updated = await pool.fetchrow("""
            UPDATE payments SET status = 'completed', gateway_transaction_id = $1,
            gateway_response = $2::jsonb, updated_at = NOW() WHERE id = $3 RETURNING *
        """, result["transaction_id"], str(result["gateway_response"]), payment["id"])

        await publish_event("payment.completed", {
            "paymentId": str(payment["id"]),
            "orderId": str(payload.order_id),
            "userId": user["userId"],
            "amount": float(payload.amount),
            "transactionId": result["transaction_id"]
        })
        logger.info("Payment completed", payment_id=str(payment["id"]))
        return {"payment": dict(updated), "message": "Payment successful"}
    else:
        await pool.execute("""
            UPDATE payments SET status = 'failed', failure_reason = $1, updated_at = NOW() WHERE id = $2
        """, result["error"], payment["id"])

        await publish_event("payment.failed", {
            "paymentId": str(payment["id"]),
            "orderId": str(payload.order_id),
            "reason": result["error"]
        })
        raise HTTPException(status_code=402, detail=f"Payment failed: {result['error']}")

@router.get("/{payment_id}")
async def get_payment(payment_id: UUID, user = Depends(verify_token)):
    pool = get_pool()
    payment = await pool.fetchrow("SELECT * FROM payments WHERE id = $1", payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if str(payment["user_id"]) != user["userId"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    return {"payment": dict(payment)}

@router.get("/order/{order_id}")
async def get_order_payment(order_id: UUID, user = Depends(verify_token)):
    pool = get_pool()
    payment = await pool.fetchrow("SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1", order_id)
    if not payment:
        raise HTTPException(status_code=404, detail="No payment found for this order")
    return {"payment": dict(payment)}

@router.post("/{payment_id}/refund")
async def refund_payment(payment_id: UUID, payload: RefundRequest, user = Depends(verify_token)):
    pool = get_pool()
    payment = await pool.fetchrow("SELECT * FROM payments WHERE id = $1", payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment["status"] != "completed":
        raise HTTPException(status_code=400, detail="Only completed payments can be refunded")

    refund_amount = payload.amount or payment["amount"]
    updated = await pool.fetchrow("""
        UPDATE payments SET status = 'refunded', refund_amount = $1, refund_reason = $2,
        refunded_at = NOW(), updated_at = NOW() WHERE id = $3 RETURNING *
    """, refund_amount, payload.reason, payment_id)

    await publish_event("payment.refunded", {
        "paymentId": str(payment_id),
        "orderId": str(payment["order_id"]),
        "amount": float(refund_amount)
    })
    return {"payment": dict(updated), "message": "Refund processed successfully"}
