# Item & Purchase Management System

A responsive inventory management application built with Node.js, Express, and MySQL. It manages item types and items, supports multi-item purchase orders, validates stock on the server, and keeps purchase history permanently.

## Features

- Item type create, read, update, and delete (deletion is blocked while items use the type).
- Item create, read, update, activation/deactivation, and conditional deletion.
- Item lists show the item type, purchase date, current stock, availability, and status.
- Purchase orders contain multiple unique items and receive server-generated order IDs.
- Purchase creation and updates use MySQL transactions and row locks.
- Stock is deducted on purchase creation and adjusted by the difference on update.
- Insufficient stock, inactive items, invalid dates, quantities, and IDs are rejected by the backend.
- Purchase history and purchase lines cannot be deleted.
- Joined item and purchase queries include their related item types.
- Responsive web UI, API documentation, Postman collection, and automated validation tests.

## Prerequisites

- Node.js 20 or newer and npm.
- MySQL 8.0 or newer (the schema uses MySQL 8 collation and check constraints).
- A MySQL account that can create/use the application database and tables.

## Step-by-step setup (Windows PowerShell)

Run these commands from the project directory:

1. Install the Node.js packages:

   ```powershell
   npm install
   ```

2. Create your local database configuration:

   ```powershell
   Copy-Item .env.example .env
   ```

   Edit `.env` and set `DB_USER` and `DB_PASSWORD` to a MySQL account with permission to create the database and tables. The example uses the local MySQL server, port 3306, and the database name `item_purchase_management`.

3. Create the database, tables, and starter item types (uses the credentials in `.env`):

   ```powershell
   npm run db:setup
   ```

   The schema seeds Electronics, Furniture, Clothing, Grocery, and Stationery item types. It is safe to run again; existing data is not deleted. (Alternative: `Get-Content .\sql\schema.sql | mysql.exe -u root -p`.)

4. Start the server:

   ```powershell
   npm run dev
   ```

   For a normal start without file watching, use `npm start`.

5. Open **http://localhost:3000** in your browser. The Express server serves both the frontend and REST API.

6. Confirm the application/database connection at **http://localhost:3000/api/health**. A healthy response is:

   ```json
   { "status": "ok", "database": "connected" }
   ```

## Deploy on Railway

The repository includes [railway.json](railway.json), which configures the Node.js build, start command, and health check.

1. Create a Railway account and install the Railway CLI. On Windows, follow the current installation steps in the [Railway CLI documentation](https://docs.railway.com/guides/cli).
2. From the project folder, authenticate and create/link a Railway project:

   ```powershell
   railway login
   railway init
   ```

3. In the Railway project, add a **MySQL** database service and a Node.js application service deployed from this project directory.
4. In the application service variables, add references to the MySQL service's `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, and `MYSQLDATABASE` variables. The server and `npm run db:setup` support these standard Railway variable names directly. Do not commit credentials to the repository.
5. Link the Railway project and the application environment in the CLI if they are not already linked, then set up the tables using the linked application's database variables:

   ```powershell
   railway run npm run db:setup
   ```

6. Deploy the application:

   ```powershell
   railway up
   ```

7. Generate or assign a public domain in the application service's **Settings → Networking**. Open the domain and confirm `/api/health` reports a connected database.

Keep the MySQL service and application in the same Railway project and use private networking for database access. Purchase history and inventory are stored in MySQL, not in the application container.

## Tests

Run the backend validation tests with:

```powershell
npm test
```

## API documentation

See [docs/API.md](docs/API.md) for routes and example requests. Import [postman/Item-Purchase-Management.postman_collection.json](postman/Item-Purchase-Management.postman_collection.json) into Postman to try the APIs.

The API returns validation errors as JSON, uses HTTP 400 for invalid input, 404 for missing records, 409 for stock/history conflicts, and a generic HTTP 500 response for unexpected errors.

## Data and stock rules

- Item stock is a non-negative whole number. An item can only be purchased while active.
- Each item may occur once per order; combine quantities into one line.
- Purchase creation validates all requested items while locking their rows, writes the order and lines, and decrements stock in one transaction. Any failure rolls the transaction back.
- Purchase updates lock the order and affected items, then apply only the stock difference. Removed lines return their quantities to stock.
- Purchase order IDs are generated by the server and cannot be changed.
- There is intentionally no purchase-delete API or UI action.
- Items with purchase history cannot be physically deleted. Deactivate them to preserve historical purchase details.
- Item types in use cannot be deleted.

## Project layout

```text
.
├── public/                 # Responsive frontend
├── src/
│   ├── routes/             # Item type, item, and purchase APIs
│   ├── errors.js           # HTTP errors and centralized error handling
│   └── validation.js       # Shared server-side validation
├── sql/schema.sql          # MySQL database, tables, constraints, starter types
├── tests/                  # Node.js built-in test runner tests
├── docs/API.md
├── postman/                # Importable Postman collection
├── .env.example
└── server.js
```
