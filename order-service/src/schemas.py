from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from decimal import Decimal

class AddressSchema(BaseModel):
    street: str
    city: str
    state: str
    country: str
    postal_code: str

class OrderItemCreate(BaseModel):
    product_id: UUID
    sku: str
    name: str
    quantity: int = Field(gt=0)
    unit_price: Decimal = Field(ge=0)

class OrderCreate(BaseModel):
    items: List[OrderItemCreate] = Field(min_length=1)
    shipping_address: AddressSchema
    billing_address: Optional[AddressSchema] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    currency: str = "INR"

class OrderStatusUpdate(BaseModel):
    status: str
    note: Optional[str] = None

class OrderResponse(BaseModel):
    id: UUID
    user_id: UUID
    status: str
    subtotal: Decimal
    shipping_cost: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    currency: str
    shipping_address: dict
    payment_status: str
    created_at: datetime
    updated_at: datetime
