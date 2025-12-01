// src/core/http.js

export function parse(event) {
  if (!event) return {};
  if (event.body && typeof event.body === "string") {
    return JSON.parse(event.body || "{}");
  }
  return event.body || {};
}

export function ok(event, body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
    body: JSON.stringify(body ?? {}),
  };
}

export function err(event, message = "ERROR", statusCode = 400) {
  const payload = typeof message === "string" ? { error: message } : message;
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
    body: JSON.stringify(payload),
  };
}
