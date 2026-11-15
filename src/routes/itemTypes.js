"use strict";

const express = require("express");
const { AppError, asyncHandler } = require("../errors");
const { positiveId, requiredText } = require("../validation");

function createItemTypeRouter(pool) {
  const router = express.Router();

  router.get("/", asyncHandler(async (request, response) => {
    const [types] = await pool.execute(
      "SELECT id, type_name, created_at, updated_at FROM item_types ORDER BY type_name"
    );
    response.json(types);
  }));

  router.post("/", asyncHandler(async (request, response) => {
    const typeName = requiredText(request.body.type_name, "Item type name", 80);
    const [result] = await pool.execute(
      "INSERT INTO item_types (type_name) VALUES (?)",
      [typeName]
    );
    const [rows] = await pool.execute(
      "SELECT id, type_name, created_at, updated_at FROM item_types WHERE id = ?",
      [result.insertId]
    );
    response.status(201).json(rows[0]);
  }));

  router.put("/:id", asyncHandler(async (request, response) => {
    const id = positiveId(request.params.id, "Item type ID");
    const typeName = requiredText(request.body.type_name, "Item type name", 80);
    const [result] = await pool.execute(
      "UPDATE item_types SET type_name = ? WHERE id = ?",
      [typeName, id]
    );
    if (!result.affectedRows) {
      const [existing] = await pool.execute("SELECT id FROM item_types WHERE id = ?", [id]);
      if (!existing.length) throw new AppError(404, "Item type not found");
    }
    const [rows] = await pool.execute(
      "SELECT id, type_name, created_at, updated_at FROM item_types WHERE id = ?",
      [id]
    );
    response.json(rows[0]);
  }));

  router.delete("/:id", asyncHandler(async (request, response) => {
    const id = positiveId(request.params.id, "Item type ID");
    const [types] = await pool.execute("SELECT id FROM item_types WHERE id = ?", [id]);
    if (!types.length) throw new AppError(404, "Item type not found");
    const [items] = await pool.execute(
      "SELECT id FROM items WHERE item_type_id = ? LIMIT 1",
      [id]
    );
    if (items.length) throw new AppError(409, "Item type is assigned to one or more items");
    await pool.execute("DELETE FROM item_types WHERE id = ?", [id]);
    response.status(204).end();
  }));

  return router;
}

module.exports = createItemTypeRouter;
