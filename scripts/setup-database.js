"use strict";

require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");

async function setupDatabase() {
  if (!Object.hasOwn(process.env, "DB_PASSWORD") && !Object.hasOwn(process.env, "MYSQLPASSWORD")) {
    throw new Error("MySQL password is not configured. Copy .env.example to .env and set DB_PASSWORD before running database setup.");
  }

  const databaseName = process.env.DB_NAME || process.env.MYSQLDATABASE || "item_purchase_management";
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error("DB_NAME may only contain letters, numbers, and underscores.");
  }

  const schemaPath = path.join(__dirname, "..", "sql", "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");
  const statements = schema
    .split(/;\s*(?:\r?\n|$)/)
    .map(statement => statement.trim())
    .filter(statement => statement && !/^(?:CREATE\s+DATABASE|USE)\b/i.test(statement));
  // Connect without selecting a database so a fresh server works, then create it.
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || process.env.MYSQLHOST || "localhost",
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || "root",
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "mysql1229",
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4`
    );
    await connection.query(`USE \`${databaseName}\``);
    for (const statement of statements) {
      await connection.query(statement);
    }
    console.log("Database schema is ready and starter item types are available.");
  } finally {
    await connection.end();
  }
}

setupDatabase().catch(error => {
  console.error("Could not set up the database. Check MySQL is running and your environment variables are correct.");
  console.error(error.message);
  process.exitCode = 1;
});
