// src/ai/tasks/build-plan-spec.js
import { parse, ok, err } from "../../ai/http.js";
import { buildCoursePlanSpec } from "../providers/gemini.js";

export const handler = async (event) => {
  try {
    const body = (() => {
      try { return parse(event) || {}; } catch { return {}; }
    })();

    const rawTopic = String(body.topic || body.title || "").trim();
    if (!rawTopic) {
      return err(event, "TOPIC_REQUIRED", 400);
    }

    const aiRes = await buildCoursePlanSpec({ topic: rawTopic });

    if (!aiRes?.allowed) {
      return err(event, aiRes?.reason || "TOPIC_NOT_ALLOWED", 400);
    }

    const { spec, suggestions = [] } = aiRes;

    const payload = {
      ...spec,       // title, prompt, level, tags
      topic: rawTopic,
      suggestions,   // aquí van las variaciones para “Sugerencias rápidas”
    };

    return ok(event, payload, 200);
  } catch (e) {
    console.error("[BUILD_PLAN_SPEC][ERROR]", e);
    const msg = e?.message || "ERROR";
    const map = { TOPIC_REQUIRED: 400 };
    return err(event, msg, map[msg] || 500);
  }
};
