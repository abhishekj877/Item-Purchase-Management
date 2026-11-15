"use strict";

require("dotenv").config();

const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const mysql = require("mysql2/promise");
const { errorHandler, notFoundHandler } = require("./src/errors");
const createItemTypeRouter = require("./src/routes/itemTypes");
const createItemsRouter = require("./src/routes/items");
const createPurchasesRouter = require("./src/routes/purchases");

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDirectory = path.join(__dirname, "public");
const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.MYSQLHOST || "localhost",
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
  user: process.env.DB_USER || process.env.MYSQLUSER || "root",
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "mysql1229",
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || "item_purchase_management",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  supportBigNumbers: true
});

app.set("indexFile", path.join(publicDirectory, "index.html"));
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // Don't force https:// for assets, so the app also loads over http://localhost (e.g. Safari).
      "upgrade-insecure-requests": null
    }
  }
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.static(publicDirectory, { index: false }));

app.get("/api/health", async (request, response, next) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok", database: "connected" });
  } catch (error) {
    next(error);
  }
});
app.use("/api/item-types", createItemTypeRouter(pool));
app.use("/api/items", createItemsRouter(pool));
app.use("/api/purchases", createPurchasesRouter(pool));
app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  if (!Object.hasOwn(process.env, "DB_PASSWORD") && !Object.hasOwn(process.env, "MYSQLPASSWORD")) {
    console.error("MySQL password is not configured. Copy .env.example to .env and set DB_PASSWORD, then restart the server.");
    await pool.end();
    process.exitCode = 1;
    return;
  }

  try {
    await pool.query("SELECT 1");
    app.listen(port, () => {
      console.log(`Item & Purchase Management System listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Could not connect to MySQL. Check the database service and .env settings.");
    console.error(error.message);
    await pool.end();
    process.exitCode = 1;
  }
}

if (require.main === module) start();

module.exports = { app, pool };
