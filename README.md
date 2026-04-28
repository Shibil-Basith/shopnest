# ShopNest — Microservices E-Commerce Platform

A production-grade, cloud-native e-commerce backend built with **7 independent microservices**, designed as a complete DevOps showcase project.

---

## Architecture Overview

```
                          ┌──────────────────────────────────────────┐
                          │              API GATEWAY (Nginx)          │
                          │              Port 80                       │
                          └──────┬──────┬──────┬──────┬──────┬───────┘
                                 │      │      │      │      │
              ┌──────────────────▼┐ ┌───▼──┐ ┌▼────┐ ┌▼────┐ ┌▼──────────────┐
              │  User Service     │ │Prod. │ │Inv. │ │Ord. │ │Pay. │ │Notif.   │
              │  Node.js :3001    │ │:3002 │ │:3003│ │:3004│ │:3005│ │:3006    │
              │  JWT + Auth       │ │Node  │ │Node │ │Fast │ │Fast │ │Node.js  │
              └────────┬──────────┘ └──┬───┘ └──┬──┘ └──┬──┘ └──┬──┘ └────┬───┘
                       │               │         │       │        │         │
              ┌─────────▼──────────────▼─────────▼───────▼────────▼─────────▼───┐
              │                    RabbitMQ (Event Bus)                           │
              │              Exchange: shopnest_events (topic)                    │
              └──────────────────────────────────────────────────────────────────┘
                       │               │         │
              ┌────────▼─┐   ┌─────────▼┐  ┌────▼────┐
              │PostgreSQL│   │PostgreSQL│  │ MongoDB │
              │(per svc) │   │(per svc) │  │(notifs) │
              └──────────┘   └──────────┘  └─────────┘
                                  │
                             ┌────▼────┐
                             │  Redis  │
                             │  Cache  │
                             └─────────┘
```

---

## Services

| Service             | Language   | Port | Database           | Description                        |
|---------------------|------------|------|--------------------|------------------------------------|
| **API Gateway**     | Nginx      | 80   | —                  | Reverse proxy, rate limiting, CORS |
| **User Service**    | Node.js    | 3001 | PostgreSQL + Redis | Auth, JWT, user profiles           |
| **Product Service** | Node.js    | 3002 | PostgreSQL + Redis | Catalog, categories, reviews       |
| **Inventory Service**| Node.js   | 3003 | PostgreSQL         | Stock management, reservations     |
| **Order Service**   | Python/FastAPI | 3004 | PostgreSQL     | Order lifecycle, cart to delivery  |
| **Payment Service** | Python/FastAPI | 3005 | PostgreSQL     | Payment processing, refunds        |
| **Notification Service** | Node.js | 3006 | MongoDB        | Email/SMS, event-driven            |

---

## Tech Stack

- **Runtimes:** Node.js 20, Python 3.11
- **Frameworks:** Express.js, FastAPI
- **Databases:** PostgreSQL 15, MongoDB 6, Redis 7
- **Message Broker:** RabbitMQ 3.12 (topic exchange)
- **API Gateway:** Nginx 1.25
- **Auth:** JWT (RS256), bcrypt, refresh tokens
- **Containerization:** Docker, Docker Compose

---

## Quick Start

### Prerequisites
- Docker ≥ 24.0
- Docker Compose ≥ 2.20

### Run Locally

```bash
# Clone and enter project
git clone <repo-url>
cd shopnest

# Copy environment variables
cp .env.example .env

# Start all services
docker compose up --build

# Run in background
docker compose up --build -d
```

Services will be available at:
- **API:** `http://localhost/api/v1/`
- **RabbitMQ Management:** `http://localhost:15672` (shopnest / rabbitmqpass123)

---

## API Reference

All requests go through the API Gateway at `http://localhost`.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login, get JWT tokens |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Logout, revoke tokens |
| GET  | `/api/v1/auth/verify` | Verify token validity |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users/profile` | Get own profile |
| PUT | `/api/v1/users/profile` | Update profile |
| GET | `/api/v1/users/addresses` | List addresses |
| POST | `/api/v1/users/addresses` | Add address |

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/products` | List products (paginated) |
| GET | `/api/v1/products/featured` | Featured products |
| GET | `/api/v1/products/search?q=` | Search products |
| GET | `/api/v1/products/:id` | Get product detail |
| POST | `/api/v1/products` | Create product (admin) |
| PUT | `/api/v1/products/:id` | Update product (admin) |
| GET | `/api/v1/products/:id/reviews` | Get product reviews |
| POST | `/api/v1/products/:id/reviews` | Add review (auth) |
| GET | `/api/v1/categories` | List categories |

### Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/inventory/check?productId=&quantity=` | Check availability |
| GET | `/api/v1/inventory/:productId` | Get stock level |
| POST | `/api/v1/inventory/:productId/add` | Add stock (admin) |
| PATCH | `/api/v1/inventory/:productId/adjust` | Adjust stock (admin) |

### Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/orders` | List user orders |
| POST | `/api/v1/orders` | Create order |
| GET | `/api/v1/orders/:id` | Get order detail |
| PATCH | `/api/v1/orders/:id/status` | Update status (admin) |
| DELETE | `/api/v1/orders/:id` | Cancel order |

### Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/payments` | Initiate payment |
| GET | `/api/v1/payments/:id` | Get payment detail |
| GET | `/api/v1/payments/order/:orderId` | Get payment by order |
| POST | `/api/v1/payments/:id/refund` | Process refund |

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/notifications` | List all notifications |
| GET | `/api/v1/notifications/user/:userId` | User notifications |
| GET | `/api/v1/notifications/stats` | Notification stats |

---

## Event Bus (RabbitMQ)

Events are published to the `shopnest_events` topic exchange.

| Routing Key | Publisher | Consumers |
|-------------|-----------|-----------|
| `user.registered` | User Service | Notification |
| `product.created` | Product Service | Inventory |
| `order.placed` | Order Service | Inventory, Notification |
| `order.shipped` | Order Service | Notification |
| `order.cancelled` | Order Service | Inventory, Notification |
| `payment.completed` | Payment Service | Order, Notification |
| `payment.failed` | Payment Service | Notification |
| `payment.refunded` | Payment Service | Notification |
| `inventory.updated` | Inventory Service | Product |

---

## Sample API Usage

### 1. Register & Login
```bash
# Register
curl -X POST http://localhost/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123","first_name":"John","last_name":"Doe"}'

# Login
curl -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123"}'
```

### 2. Browse Products
```bash
# List
curl http://localhost/api/v1/products

# Search
curl "http://localhost/api/v1/products/search?q=laptop"

# By category
curl "http://localhost/api/v1/products?category=electronics"
```

### 3. Place an Order
```bash
curl -X POST http://localhost/api/v1/orders \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{"product_id":"<uuid>","sku":"SKU001","name":"Product","quantity":2,"unit_price":499.00}],
    "shipping_address": {"street":"123 MG Road","city":"Bengaluru","state":"Karnataka","country":"India","postal_code":"560001"},
    "payment_method": "upi"
  }'
```

---

## Project Structure

```
shopnest/
├── docker-compose.yml          # Full stack orchestration
├── .env.example                # Environment template
├── api-gateway/
│   ├── Dockerfile
│   └── nginx/nginx.conf        # Routing, rate limiting
├── user-service/               # Node.js — Auth & Users
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── controllers/
│       ├── routes/
│       ├── middleware/
│       ├── db/
│       ├── cache/
│       └── messaging/
├── product-service/            # Node.js — Catalog
├── inventory-service/          # Node.js — Stock
├── order-service/              # Python/FastAPI — Orders
│   └── src/
│       ├── main.py
│       ├── database.py
│       ├── messaging.py
│       ├── auth.py
│       ├── schemas.py
│       └── routers/
├── payment-service/            # Python/FastAPI — Payments
└── notification-service/       # Node.js — Emails
    └── src/
        ├── index.js
        ├── models/
        ├── services/
        ├── messaging/
        └── routes/
```

---

## DevOps Notes

This project is structured for complete DevOps automation:

- Each service has its own **Dockerfile** with multi-stage builds and non-root users
- **Health check** endpoints on every service (`/health`)
- Services use **environment variables** — no hardcoded secrets
- Database schema is created on startup (idempotent `CREATE TABLE IF NOT EXISTS`)
- RabbitMQ connections use **retry logic** (10 attempts, 3s backoff)
- Each service is independently **scalable** — stateless where possible

**Suggested DevOps additions (your domain):**
- Dockerize → Jenkins CI pipeline per service
- Kubernetes manifests (Deployment, Service, HPA, ConfigMap, Secret)
- Terraform for AWS infra (VPC, EKS, RDS, ElastiCache, DocumentDB)
- Ansible for node configuration
- Prometheus scrape targets on `/metrics`
- Grafana dashboards for per-service observability

---

## Environment Variables Reference

See `.env.example` for all variables. Key ones:

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Shared JWT signing secret (all services) |
| `RABBITMQ_URL` | Full AMQP connection string |
| `REDIS_HOST` / `REDIS_PASSWORD` | Redis connection |
| `DB_HOST` / `DB_NAME` / ... | Per-service PostgreSQL config |
| `MONGO_URI` | Notification service MongoDB URI |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Email (optional) |
| `STRIPE_SECRET_KEY` | Replace with real key for payments |

---

## License

MIT — Free to use for learning, portfolio, and production.
