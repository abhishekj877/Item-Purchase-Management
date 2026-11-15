"use strict";

const express = require("express");
const { AppError, asyncHandler } = require("../errors");
const {
  booleanValue,
  isoDate,
  nonnegativeInteger,
  positiveId,
  requiredText
} = require("../validation");

const ITEM_SELECT = `
  SELECT i.id, i.name, i.item_type_id, it.type_name, i.purchase_date,
         i.stock_available, i.active, i.created_at, i.updated_at
  FROM items i
  JOIN item_types it ON i.item_type_id = it.id
`;

function createItemsRouter(pool) {
  const router = express.Router();

  router.get("/", asyncHandler(async (request, response) => {
    const includeInactive = request.query.includeInactive === "true";
    const [items] = await pool.execute(
      `${ITEM_SELECT} ${includeInactive ? "" : "WHERE i.active = 1"} ORDER BY i.name`
    );
    response.json(items);
  }));

  router.get("/:id", asyncHandler(async (request, response) => {
    const id = positiveId(request.params.id, "Item ID");
    const [items] = await pool.execute(`${ITEM_SELECT} WHERE i.id = ?`, [id]);
    if (!items.length) throw new AppError(404, "Item not found");
    response.json(items[0]);
  }));

  router.post("/", asyncHandler(async (request, response) => {
    const item = validateItem(request.body);
    const [types] = await pool.execute("SELECT id FROM item_types WHERE id = ?", [item.item_type_id]);
    if (!types.length) throw new AppError(400, "Invalid item type");

    const [result] = await pool.execute(
      `INSERT INTO items (name, item_type_id, purchase_date, stock_available, active)
       VALUES (?, ?, ?, ?, ?)`,
      [item.name, item.item_type_id, item.purchase_date, item.stock_available, item.active]
    );
    const [rows] = await pool.execute(`${ITEM_SELECT} WHERE i.id = ?`, [result.insertId]);
    response.status(201).json(rows[0]);
  }));

  router.put("/:id", asyncHandler(async (request, response) => {
    const id = positiveId(request.params.id, "Item ID");
    const item = validateItem(request.body);
    const [types] = await pool.execute("SELECT id FROM item_types WHERE id = ?", [item.item_type_id]);
    if (!types.length) throw new AppError(400, "Invalid item type");

    const [result] = await pool.execute(
      `UPDATE items
       SET name = ?, item_type_id = ?, purchase_date = ?, stock_available = ?, active = ?
       WHERE id = ?`,
      [item.name, item.item_type_id, item.purchase_date, item.stock_available, item.active, id]
    );
    if (!result.affectedRows) {
      const [existing] = await pool.execute("SELECT id FROM items WHERE id = ?", [id]);
      if (!existing.length) throw new AppError(404, "Item not found");
    }
    const [rows] = await pool.execute(`${ITEM_SELECT} WHERE i.id = ?`, [id]);
    response.json(rows[0]);
  }));

  router.patch("/:id/status", asyncHandler(async (request, response) => {
    const id = positiveId(request.params.id, "Item ID");
    const active = booleanValue(request.body.active);
    const [result] = await pool.execute("UPDATE items SET active = ? WHERE id = ?", [active, id]);
    if (!result.affectedRows) {
      const [existing] = await pool.execute("SELECT id FROM items WHERE id = ?", [id]);
      if (!existing.length) throw new AppError(404, "Item not found");
    }
    const [rows] = await pool.execute(`${ITEM_SELECT} WHERE i.id = ?`, [id]);
    response.json(rows[0]);
  }));

  router.delete("/:id", asyncHandler(async (request, response) => {
    const id = positiveId(request.params.id, "Item ID");
    const [items] = await pool.execute("SELECT id FROM items WHERE id = ?", [id]);
    if (!items.length) throw new AppError(404, "Item not found");
    const [history] = await pool.execute(
      "SELECT id FROM purchase_items WHERE item_id = ? LIMIT 1",
      [id]
    );
    if (history.length) {
      throw new AppError(409, "Item has purchase history; deactivate it to preserve the record");
    }
    await pool.execute("DELETE FROM items WHERE id = ?", [id]);
    response.status(204).end();
  }));

  return router;
}

function validateItem(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(400, "A valid item request body is required");
  }
  return {
    name: requiredText(body.name, "Item name"),
    item_type_id: positiveId(body.item_type_id, "Item type ID"),
    purchase_date: isoDate(body.purchase_date),
    stock_available: nonnegativeInteger(body.stock_available, "Stock available"),
    active: booleanValue(body.active)
  };
}

module.exports = createItemsRouter;
