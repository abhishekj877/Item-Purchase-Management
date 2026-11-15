"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { AppError, asyncHandler } = require("../errors");
const { isoDate, positiveId, purchaseLines } = require("../validation");

const DETAIL_QUERY = `
  SELECT p.id, p.order_id, p.purchase_date, p.created_at, p.updated_at,
         pi.id AS purchase_item_id, pi.item_id, i.name AS item_name,
         i.item_type_id, it.type_name, pi.quantity, i.stock_available,
         i.active AS item_active
  FROM purchases p
  JOIN purchase_items pi ON p.id = pi.purchase_id
  JOIN items i ON pi.item_id = i.id
  JOIN item_types it ON i.item_type_id = it.id
`;

function createPurchasesRouter(pool) {
  const router = express.Router();

  router.get("/", asyncHandler(async (request, response) => {
    const [rows] = await pool.execute(`${DETAIL_QUERY} ORDER BY p.created_at DESC, pi.id`);
    response.json(groupPurchaseRows(rows));
  }));

  router.get("/:id", asyncHandler(async (request, response) => {
    const id = positiveId(request.params.id, "Purchase ID");
    const [rows] = await pool.execute(`${DETAIL_QUERY} WHERE p.id = ? ORDER BY pi.id`, [id]);
    if (!rows.length) throw new AppError(404, "Purchase not found");
    response.json(groupPurchaseRows(rows)[0]);
  }));

  router.post("/", asyncHandler(async (request, response) => {
    const purchase = validatePurchase(request.body);
    const connection = await pool.getConnection();
    let transactionStarted = false;
    try {
      await connection.beginTransaction();
      transactionStarted = true;
      const lockedItems = await lockItems(connection, purchase.items.map(line => line.item_id));
      validateAvailability(lockedItems, purchase.items);

      const orderId = createOrderId();
      const [header] = await connection.execute(
        "INSERT INTO purchases (order_id, purchase_date) VALUES (?, ?)",
        [orderId, purchase.purchase_date]
      );
      await insertLinesAndAdjustStock(connection, header.insertId, purchase.items);
      const result = await getPurchase(connection, header.insertId);
      await connection.commit();
      transactionStarted = false;
      response.status(201).json(result);
    } catch (error) {
      if (transactionStarted) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Could not roll back purchase creation:", rollbackError);
        }
      }
      throw error;
    } finally {
      connection.release();
    }
  }));

  router.put("/:id", asyncHandler(async (request, response) => {
    const id = positiveId(request.params.id, "Purchase ID");
    const purchase = validatePurchase(request.body);
    const connection = await pool.getConnection();
    let transactionStarted = false;
    try {
      await connection.beginTransaction();
      transactionStarted = true;
      const [headers] = await connection.execute(
        "SELECT id FROM purchases WHERE id = ? FOR UPDATE",
        [id]
      );
      if (!headers.length) throw new AppError(404, "Purchase not found");

      const [oldLines] = await connection.execute(
        "SELECT item_id, quantity FROM purchase_items WHERE purchase_id = ? ORDER BY item_id FOR UPDATE",
        [id]
      );
      const oldQuantities = new Map(oldLines.map(line => [Number(line.item_id), Number(line.quantity)]));
      const allItemIds = [...new Set([
        ...oldQuantities.keys(),
        ...purchase.items.map(line => line.item_id)
      ])];
      const lockedItems = await lockItems(connection, allItemIds);
      const itemById = new Map(lockedItems.map(item => [Number(item.id), item]));

      for (const line of purchase.items) {
        const item = itemById.get(line.item_id);
        if (!item) throw new AppError(404, `Item ${line.item_id} not found`);
        const difference = line.quantity - (oldQuantities.get(line.item_id) || 0);
        if (difference > 0) {
          if (!Number(item.active)) {
            throw new AppError(409, `${item.name} is inactive and cannot be purchased`);
          }
          if (Number(item.stock_available) < difference) {
            throw new AppError(409, `Insufficient stock for ${item.name}; ${item.stock_available} available`);
          }
        }
      }

      await connection.execute("UPDATE purchases SET purchase_date = ? WHERE id = ?", [
        purchase.purchase_date,
        id
      ]);
      await connection.execute("DELETE FROM purchase_items WHERE purchase_id = ?", [id]);
      await insertLinesAndAdjustStock(connection, id, purchase.items, oldQuantities, itemById);
      const result = await getPurchase(connection, id);
      await connection.commit();
      transactionStarted = false;
      response.json(result);
    } catch (error) {
      if (transactionStarted) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Could not roll back purchase update:", rollbackError);
        }
      }
      throw error;
    } finally {
      connection.release();
    }
  }));

  return router;
}

function validatePurchase(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(400, "A valid purchase request body is required");
  }
  return {
    purchase_date: isoDate(body.purchase_date),
    items: purchaseLines(body.items)
  };
}

function createOrderId() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `PO-${date}-${suffix}`;
}

async function lockItems(connection, ids) {
  const uniqueIds = [...new Set(ids)].sort((a, b) => a - b);
  if (!uniqueIds.length) return [];
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const [items] = await connection.execute(
    `SELECT id, name, stock_available, active
     FROM items WHERE id IN (${placeholders}) ORDER BY id FOR UPDATE`,
    uniqueIds
  );
  return items;
}

function validateAvailability(items, lines) {
  const itemById = new Map(items.map(item => [Number(item.id), item]));
  for (const line of lines) {
    const item = itemById.get(line.item_id);
    if (!item) throw new AppError(404, `Item ${line.item_id} not found`);
    if (!Number(item.active)) throw new AppError(409, `${item.name} is inactive and cannot be purchased`);
    if (Number(item.stock_available) < line.quantity) {
      throw new AppError(409, `Insufficient stock for ${item.name}; ${item.stock_available} available`);
    }
  }
}

async function insertLinesAndAdjustStock(connection, purchaseId, lines, oldQuantities = new Map(), itemById = null) {
  const values = lines.map(line => [purchaseId, line.item_id, line.quantity]);
  await connection.query(
    "INSERT INTO purchase_items (purchase_id, item_id, quantity) VALUES ?",
    [values]
  );

  for (const [itemId, difference] of calculateStockDeltas(oldQuantities, lines)) {
    if (!difference) continue;
    const operator = difference > 0 ? "-" : "+";
    const amount = Math.abs(difference);
    const parameters = difference > 0 ? [amount, itemId, amount] : [amount, itemId];
    const [result] = await connection.execute(
      `UPDATE items
       SET stock_available = stock_available ${operator} ?
       WHERE id = ? ${difference > 0 ? "AND stock_available >= ?" : ""}`,
      parameters
    );
    if (!result.affectedRows) {
      const item = itemById && itemById.get(itemId);
      throw new AppError(409, item
        ? `Insufficient stock for ${item.name}`
        : "Stock changed before the purchase could be completed");
    }
  }
}

function calculateStockDeltas(oldQuantities, lines) {
  const newQuantities = new Map(lines.map(line => [line.item_id, line.quantity]));
  const deltas = new Map();
  for (const [itemId, quantity] of newQuantities) {
    deltas.set(itemId, quantity - (oldQuantities.get(itemId) || 0));
  }
  for (const [itemId, quantity] of oldQuantities) {
    if (!newQuantities.has(itemId)) deltas.set(itemId, -quantity);
  }
  return deltas;
}

async function getPurchase(connection, id) {
  const [rows] = await connection.execute(`${DETAIL_QUERY} WHERE p.id = ? ORDER BY pi.id`, [id]);
  return groupPurchaseRows(rows)[0];
}

function groupPurchaseRows(rows) {
  const purchases = new Map();
  for (const row of rows) {
    let purchase = purchases.get(Number(row.id));
    if (!purchase) {
      purchase = {
        id: Number(row.id),
        order_id: row.order_id,
        purchase_date: row.purchase_date,
        created_at: row.created_at,
        updated_at: row.updated_at,
        items: []
      };
      purchases.set(purchase.id, purchase);
    }
    purchase.items.push({
      purchase_item_id: Number(row.purchase_item_id),
      item_id: Number(row.item_id),
      item_name: row.item_name,
      item_type_id: Number(row.item_type_id),
      type_name: row.type_name,
      quantity: Number(row.quantity),
      stock_available: Number(row.stock_available),
      item_active: Boolean(row.item_active)
    });
  }
  return [...purchases.values()];
}

module.exports = createPurchasesRouter;
module.exports.calculateStockDeltas = calculateStockDeltas;
