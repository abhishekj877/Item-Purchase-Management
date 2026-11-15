# REST API

All endpoints are served from `http://localhost:3000`. JSON request bodies use `Content-Type: application/json`. IDs are positive database integers.

## Health

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Check API and MySQL connectivity |

## Item types

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/item-types` | List item types |
| POST | `/api/item-types` | Create a type: `{ "type_name": "Electronics" }` |
| PUT | `/api/item-types/:id` | Rename a type |
| DELETE | `/api/item-types/:id` | Delete only when no items use it |

Type names are required, limited to 80 characters, and unique.

## Items

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/items` | List active items with joined item type |
| GET | `/api/items?includeInactive=true` | List active and inactive items |
| GET | `/api/items/:id` | Get one item and its item type |
| POST | `/api/items` | Create an item |
| PUT | `/api/items/:id` | Update item details and stock |
| PATCH | `/api/items/:id/status` | Activate/deactivate an item |
| DELETE | `/api/items/:id` | Delete only if no purchase history exists |

Item request example:

```json
{
  "name": "Laptop",
  "item_type_id": 1,
  "purchase_date": "2026-08-25",
  "stock_available": 10,
  "active": true
}
```

`name`, `item_type_id`, `purchase_date`, `stock_available`, and `active` are required for create/update. Stock must be a non-negative whole number and the type must exist.

## Purchases

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/purchases` | List purchase history with joined item/type details |
| GET | `/api/purchases/:id` | Get one purchase and all of its lines |
| POST | `/api/purchases` | Create an order and deduct stock transactionally |
| PUT | `/api/purchases/:id` | Update order date/lines and adjust stock transactionally |

There is deliberately **no DELETE purchase endpoint**.

Purchase create/update request example:

```json
{
  "purchase_date": "2026-08-25",
  "items": [
    { "item_id": 1, "quantity": 2 },
    { "item_id": 2, "quantity": 5 }
  ]
}
```

The server generates the order ID and returns the purchase, including joined item names, item types, quantities, and current stock. A purchase must contain at least one line. Each item can appear only once, quantities must be positive whole numbers, and all items must be active with sufficient stock.

## Status and errors

- `200 OK`: read or update succeeded.
- `201 Created`: item, item type, or purchase created.
- `204 No Content`: item/type deletion succeeded.
- `400 Bad Request`: invalid ID, field, date, or request body.
- `404 Not Found`: requested record or API endpoint does not exist.
- `409 Conflict`: duplicate type, insufficient stock, inactive item, or record cannot be deleted because it is in use/history.
- `500 Internal Server Error`: unexpected database/server error; sensitive details are not returned.

Errors have the form:

```json
{ "error": "Insufficient stock for Laptop; 8 available" }
```

## JOIN and transaction implementation

`GET /api/items` joins `items` to `item_types`. Purchase list/detail queries join `purchases`, `purchase_items`, `items`, and `item_types`.

Purchase creation locks requested item rows, validates activity and stock, inserts the header and lines, and updates stock within one transaction. Purchase updates lock the order and affected item rows and adjust quantities by `new quantity - old quantity`; dropped lines are returned to stock. Failed operations roll back.
