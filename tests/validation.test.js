"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  booleanValue,
  isoDate,
  nonnegativeInteger,
  positiveId,
  positiveInteger,
  purchaseLines,
  requiredText
} = require("../src/validation");
const { calculateStockDeltas } = require("../src/routes/purchases");

function rejectsWithMessage(callback, message) {
  assert.throws(callback, error => error.message === message);
}

test("required text is trimmed and rejects blank names", () => {
  assert.equal(requiredText("  Keyboard  ", "Item name"), "Keyboard");
  rejectsWithMessage(() => requiredText("  ", "Item name"), "Item name is required");
});

test("IDs and quantities require bounded whole numbers", () => {
  assert.equal(positiveId("12"), 12);
  assert.equal(nonnegativeInteger(0, "Stock"), 0);
  assert.equal(positiveInteger(3, "Quantity"), 3);
  rejectsWithMessage(() => positiveId("0"), "ID must be a positive integer");
  rejectsWithMessage(() => positiveId(true), "ID must be a positive integer");
  rejectsWithMessage(() => nonnegativeInteger(-1, "Stock"), "Stock must be a non-negative whole number");
  rejectsWithMessage(() => nonnegativeInteger("1", "Stock"), "Stock must be a non-negative whole number");
  rejectsWithMessage(() => positiveInteger(0, "Quantity"), "Quantity must be greater than zero");
});

test("dates must be real ISO calendar dates", () => {
  assert.equal(isoDate("2026-08-25"), "2026-08-25");
  rejectsWithMessage(() => isoDate("2026-02-30"), "Purchase date must be a valid date in YYYY-MM-DD format");
  rejectsWithMessage(() => isoDate("25-08-2026"), "Purchase date must be a valid date in YYYY-MM-DD format");
});

test("active status accepts explicit booleans only", () => {
  assert.equal(booleanValue(true), 1);
  assert.equal(booleanValue(false), 0);
  rejectsWithMessage(() => booleanValue("yes"), "Active status must be true or false");
});

test("purchase lines must be nonempty, positive, and unique by item", () => {
  assert.deepEqual(purchaseLines([{ item_id: 4, quantity: 2 }]), [{ item_id: 4, quantity: 2 }]);
  rejectsWithMessage(() => purchaseLines([]), "A purchase must contain at least one item");
  rejectsWithMessage(
    () => purchaseLines([{ item_id: 4, quantity: 2 }, { item_id: 4, quantity: 1 }]),
    "An item may only appear once in a purchase"
  );
  rejectsWithMessage(
    () => purchaseLines([{ item_id: 4, quantity: 0 }]),
    "Quantity on line 1 must be greater than zero"
  );
});

test("purchase stock deltas cover increases, decreases, additions, and removed lines", () => {
  const previous = new Map([[1, 3], [2, 5], [4, 2]]);
  const next = [{ item_id: 1, quantity: 5 }, { item_id: 2, quantity: 2 }, { item_id: 3, quantity: 7 }];
  assert.deepEqual([...calculateStockDeltas(previous, next)], [[1, 2], [2, -3], [3, 7], [4, -2]]);
});
