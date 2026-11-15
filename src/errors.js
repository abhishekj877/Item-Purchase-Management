"use strict";

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asyncHandler(handler) {
  return function wrappedHandler(request, response, next) {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function notFoundHandler(request, response, next) {
  if (request.path.startsWith("/api/")) {
    next(new AppError(404, "API endpoint not found"));
    return;
  }
  response.sendFile(request.app.get("indexFile"));
}

function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    response.status(error.status).json({ error: error.message });
    return;
  }

  if (error && error.type === "entity.parse.failed") {
    response.status(400).json({ error: "Request body must contain valid JSON" });
    return;
  }

  if (error && error.code === "ER_DUP_ENTRY") {
    response.status(409).json({ error: "A record with that value already exists" });
    return;
  }

  if (error && error.code === "ER_NO_REFERENCED_ROW_2") {
    response.status(400).json({ error: "The selected related record does not exist" });
    return;
  }

  if (error && error.code === "ER_ROW_IS_REFERENCED_2") {
    response.status(409).json({ error: "This record is in use and cannot be deleted" });
    return;
  }

  console.error("Unhandled request error:", error);
  response.status(500).json({ error: "An unexpected server error occurred" });
}

module.exports = { AppError, asyncHandler, errorHandler, notFoundHandler };
