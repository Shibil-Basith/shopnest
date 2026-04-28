from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from uuid import UUID
import httpx
import structlog

from ..database import get_pool
from ..messaging import publish_event
from ..auth import verify_token, require_admin
from ..schemas import OrderCreate, OrderStatusUpdate

router = APIRouter()
logger = structlog.get_logger()

INVENTORY_SERVICE = "http://inventory-service:3003"
PRODUCT_SERVICE   = "http://product-service:3002"

@router.get("/")
async def list_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    status: Optional[str] = None,
    user = Depends(verify_token)
):
    pool = get_pool()
    offset = (page - 1) * limit
    where = "WHERE user_id = $1" if user.get("role") != "admin" else "WHERE 1=1"
    params = [user["userId"]] if user.get("role") != "admin" else []

    if status:
        params.append(status)
        where += f" AND status = ${len(params)}"

    params += [limit, offset]
    rows = await pool.fetch(
        f"SELECT * FROM orders {where} ORDER BY created_at DESC LIMIT ${len(params)-1} OFFSET ${len(params)}",
        *params
    )
    return {"orders": [dict(r) for r in rows], "page": page, "limit": limit}

@router.get("/{order_id}")
async def get_order(order_id: UUID, user = Depends(verify_token)):
    pool = get_pool()
    order = await pool.fetchrow("SELECT * FROM orders WHERE id = $1", order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if str(order["user_id"]) != user["userId"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    items = await pool.fetch("SELECT * FROM order_items WHERE order_id = $1", order_id)
    history = await pool.fetch("SELECT * FROM order_history WHERE order_id = $1 ORDER BY created_at DESC", order_id)

    return {
        "order": dict(order),
        "items": [dict(i) for i in items],
        "history": [dict(h) for h in history]
    }

@router.post("/", status_code=201)
async def create_order(payload: OrderCreate, user = Depends(verify_token)):
    pool = get_pool()

    # Verify inventory availability
    async with httpx.AsyncClient(timeout=10) as client:
        for item in payload.items:
            resp = await client.get(
                f"{INVENTORY_SERVICE}/api/v1/inventory/check",
                params={"productId": str(item.product_id), "quantity": item.quantity}
            )
            if resp.status_code == 200 and not resp.json().get("available"):
                raise HTTPException(status_code=422, detail=f"Insufficient stock for product {item.sku}")

    subtotal = sum(item.unit_price * item.quantity for item in payload.items)
    shipping = 50 if subtotal < 500 else 0
    tax = round(subtotal * 18 / 100, 2)
    total = subtotal + shipping + tax

    async with pool.acquire() as conn:
        async with conn.transaction():
            order = await conn.fetchrow("""
                INSERT INTO orders (user_id, subtotal, shipping_cost, tax_amount, total_amount,
                    currency, shipping_address, billing_address, payment_method, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
                RETURNING *
            """, UUID(user["userId"]), subtotal, shipping, tax, total,
                payload.currency,
                payload.shipping_address.model_dump_json(),
                payload.billing_address.model_dump_json() if payload.billing_address else None,
                payload.payment_method, payload.notes
            )

            for item in payload.items:
                await conn.execute("""
                    INSERT INTO order_items (order_id, product_id, sku, name, quantity, unit_price, total_price)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                """, order["id"], item.product_id, item.sku, item.name,
                    item.quantity, item.unit_price, item.unit_price * item.quantity
                )

            await conn.execute(
                "INSERT INTO order_history (order_id, status, note, created_by) VALUES ($1, $2, $3, $4)",
                order["id"], "pending", "Order created", UUID(user["userId"])
            )

    await publish_event("order.placed", {
        "orderId": str(order["id"]),
        "userId": user["userId"],
        "total": float(total),
        "items": [{"productId": str(i.product_id), "quantity": i.quantity} for i in payload.items]
    })

    logger.info("Order created", order_id=str(order["id"]))
    return {"order": dict(order), "message": "Order placed successfully"}

@router.patch("/{order_id}/status")
async def update_order_status(order_id: UUID, payload: OrderStatusUpdate, user = Depends(require_admin)):
    pool = get_pool()
    valid_statuses = ['pending','confirmed','processing','shipped','delivered','cancelled','refunded']
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=422, detail=f"Invalid status. Must be one of: {valid_statuses}")

    order = await pool.fetchrow("UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *", payload.status, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    await pool.execute(
        "INSERT INTO order_history (order_id, status, note, created_by) VALUES ($1, $2, $3, $4)",
        order_id, payload.status, payload.note, UUID(user["userId"])
    )

    await publish_event(f"order.{payload.status}", {"orderId": str(order_id), "status": payload.status})
    return {"order": dict(order)}

@router.delete("/{order_id}")
async def cancel_order(order_id: UUID, user = Depends(verify_token)):
    pool = get_pool()
    order = await pool.fetchrow("SELECT * FROM orders WHERE id = $1", order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if str(order["user_id"]) != user["userId"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    if order["status"] not in ["pending", "confirmed"]:
        raise HTTPException(status_code=400, detail="Order cannot be cancelled at this stage")

    await pool.execute("UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1", order_id)
    items = await pool.fetch("SELECT * FROM order_items WHERE order_id = $1", order_id)

    await publish_event("order.cancelled", {
        "orderId": str(order_id),
        "items": [{"productId": str(i["product_id"]), "quantity": i["quantity"]} for i in items]
    })
    return {"message": "Order cancelled successfully"}
