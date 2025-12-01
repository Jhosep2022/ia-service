// src/core/env.js
export const env = {
  stage: process.env.STAGE || process.env.NODE_ENV || "dev",
  googleApiKey: process.env.GOOGLE_API_KEY,
  geminiModelId: process.env.GEMINI_MODEL_ID || "gemini-2.5-flash-lite",
};
