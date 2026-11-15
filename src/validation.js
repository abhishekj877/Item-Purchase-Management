"use strict";

const { AppError } = require("./errors");

const MAX_INT = 2147483647;

function positiveId(value, label = "ID") {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_INT) {
    throw new AppError(400, `${label} must be a positive integer`);
  }
  return parsed;
}

function requiredText(value, label, maxLength = 120) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(400, `${label} is required`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new AppError(400, `${label} must be ${maxLength} characters or fewer`);
  }
  return text;
}

function nonnegativeInteger(value, label) {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_INT) {
    throw new AppError(400, `${label} must be a non-negative whole number`);
  }
  return parsed;
}

function positiveInteger(value, label) {
  const parsed = nonnegativeInteger(value, label);
  if (parsed === 0) {
    throw new AppError(400, `${label} must be greater than zero`);
  }
  return parsed;
}

function isoDate(value, label = "Purchase date") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, `${label} must be a valid date in YYYY-MM-DD format`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new AppError(400, `${label} must be a valid date in YYYY-MM-DD format`);
  }
  return value;
}

function booleanValue(value, label = "Active status") {
  if (value === true || value === 1 || value === "1") return 1;
  if (value === false || value === 0 || value === "0") return 0;
  throw new AppError(400, `${label} must be true or false`);
}

function purchaseLines(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError(400, "A purchase must contain at least one item");
  }

  const seen = new Set();
  return value.map((line, index) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      throw new AppError(400, `Purchase item ${index + 1} is invalid`);
    }
    const itemId = positiveId(line.item_id, `Item ID on line ${index + 1}`);
    const quantity = positiveInteger(line.quantity, `Quantity on line ${index + 1}`);
    if (seen.has(itemId)) {
      throw new AppError(400, "An item may only appear once in a purchase");
    }
    seen.add(itemId);
    return { item_id: itemId, quantity };
  });
}

module.exports = {
  booleanValue,
  isoDate,
  nonnegativeInteger,
  positiveId,
  positiveInteger,
  purchaseLines,
  requiredText
};
