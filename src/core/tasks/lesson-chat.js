// src/ai/tasks/lesson-chat.js
import { parse, ok, err } from "../../ai/http.js";
import { refineLessonWithQuestion } from "../providers/gemini.js";

export const handler = async (event) => {
  try {
    const body = (() => {
      try { return parse(event) || {}; } catch { return {}; }
    })();

    const question = String(body.question || "").trim();
    const lesson = body.lesson || {};

    if (!question) {
      return err(event, "QUESTION_REQUIRED", 400);
    }

    if (!lesson || !lesson.contentMD) {
      return err(event, "LESSON_REQUIRED", 400);
    }

    const aiRes = await refineLessonWithQuestion({ lesson, question });

    const answer = String(aiRes?.answer || "").trim();
    const updated = aiRes?.updatedLesson || {};

    // Merge defensivo: si la IA omite algo, usamos lo que venía arreglso
    const mergedLesson = {
      title: updated.title || lesson.title,
      summary: updated.summary || lesson.summary,
      contentMD: updated.contentMD || lesson.contentMD,
      tips: Array.isArray(updated.tips)
        ? updated.tips
        : Array.isArray(lesson.tips) ? lesson.tips : [],
      miniChallenge: updated.miniChallenge || lesson.miniChallenge || null,
    };

    return ok(event, {
      answer,
      updatedLesson: mergedLesson,
    }, 200);
  } catch (e) {
    console.error("[LESSON_CHAT][ERROR]", e);
    const msg = e?.message || "ERROR";
    const map = {
      QUESTION_REQUIRED: 400,
      LESSON_REQUIRED: 400,
    };
    return err(event, msg, map[msg] || 500);
  }
};
