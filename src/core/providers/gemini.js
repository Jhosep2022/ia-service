// src/ai/providers/gemini.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../ai/env.js";

function flattenMessages(messages) {
  const sys = messages.find((m) => m.role === "system")?.content || null;
  const user = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
  return { sys, user };
}

async function chatGemini(
  messages,
  { maxTokens = 400, mimeType = "application/json" } = {}
) {
  if (!env.googleApiKey) throw new Error("Missing GOOGLE_API_KEY");

  const genAI = new GoogleGenerativeAI(env.googleApiKey);
  const { sys, user } = flattenMessages(messages);

  const model = genAI.getGenerativeModel({
    model: env.geminiModelId || "gemini-2.5-flash-lite",
    ...(sys ? { systemInstruction: sys } : {}),
    generationConfig: {
      maxOutputTokens: maxTokens,
      responseMimeType: mimeType,
    },
  });

  const r = await model.generateContent(user || "");
  const text = r?.response?.text?.() ?? "";
  return text;
}

/**
 * Devuelve:
 *  - allowed: true|false
 *  - spec: { title, prompt, level, tags[] }   (si allowed = true)
 *  - suggestions: [ { title, prompt, level, tags[] } ]
 */
export async function buildCoursePlanSpec({ topic }) {
  const cleanTopic = String(topic || "").trim();
  if (!cleanTopic) throw new Error("TOPIC_REQUIRED");

  const sys =
    "Eres un asistente que SOLO diseña planes de prompts para cursos de PROGRAMACIÓN y DESARROLLO DE SOFTWARE. " +
    "Siempre respondes ÚNICAMENTE JSON válido.";

  const user = `
El usuario pide un curso con este texto:

"${cleanTopic}"

Debes decidir si el tema es APTO (programación, desarrollo de software, bases de datos, devops, cloud, testing,
data/IA para programadores) y NO debe ser sobre drogas, armas, violencia, contenido sexual, medicina, política, etc.

### SI EL TEMA ES VÁLIDO:
Devuelve EXACTAMENTE este JSON:

{
  "allowed": true,
  "spec": {
    "title": "Título amigable para el curso en español",
    "prompt": "Instrucción clara en español para que otra IA genere el curso (explica enfoque, qué cubrir, ejercicios, ejemplos, etc.)",
    "level": "beginner|intermediate|advanced",
    "tags": ["tag1", "tag2", "tag3"]
  },
  "suggestions": [
    {
      "title": "Otra variación interesante del mismo tema",
      "prompt": "Instrucción clara para ese curso alternativo",
      "level": "beginner|intermediate|advanced",
      "tags": ["tag1", "tag2", "tag3"]
    }
  ]
}

Reglas:
- "title": máx. 80 caracteres, sin comillas internas.
- "prompt": 1–3 frases en español, orientadas a PROGRAMACIÓN.
- "tags": 2–6 elementos, en inglés, minúsculas. Ej: ["python","oop","beginners"].

### SI EL TEMA NO ES VÁLIDO:
Devuelve EXACTAMENTE este JSON:

{
  "allowed": false,
  "reason": "Motivo corto en español de por qué el tema no es aceptado (solo programación)."
}

No incluyas nada fuera de ese JSON.
`.trim();

  const text = await chatGemini(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    { maxTokens: 550, mimeType: "application/json" }
  );

  return JSON.parse(text);
}

/**
 * Chat tipo tutor de lección:
 *  - Devuelve answer (markdown corto, personalizado)
 *  - updatedLesson: simplemente la lección original (no la reescribe la IA)
 */
export async function refineLessonWithQuestion({ lesson, question }) {
  const cleanQ = String(question || "").trim();
  if (!cleanQ) throw new Error("QUESTION_REQUIRED");

  // Recortamos para no mandar bloques gigantes (solo contexto)
  const safeLesson = {
    title: String(lesson?.title || "").slice(0, 160),
    summary: String(lesson?.summary || "").slice(0, 800),
    contentMD: String(lesson?.contentMD || "").slice(0, 8000),
  };

  const sys =
    "Eres un tutor experto en PROGRAMACIÓN para una plataforma e-learning. " +
    "Te comportas como un BOT DE DUDAS personal de la lección. " +
    "Respondes SIEMPRE en español neutro. Devuelves SOLO TEXTO PLANO en markdown, nunca JSON.";

  const user = `
Tienes la siguiente LECCIÓN actual (markdown recortado):

---
Title: ${safeLesson.title}
Summary: ${safeLesson.summary}

CONTENT_MD:
${safeLesson.contentMD}
---

El estudiante hace esta pregunta o pide aclaración:

"${cleanQ}"

Tu tarea:

- Responde DIRECTAMENTE a la duda del estudiante.
- La respuesta debe ser CORTA y muy concreta:
  - Máximo 2–3 párrafos.
  - Máximo ~10 líneas en total.
  - Puedes usar UN bloque de código corto (\`\`\`<lenguaje>\`\`\`) de 4–8 líneas si sirve para aclarar.
- No reescribas la lección completa.
- No devuelvas plantillas, ni estructuras, ni JSON.
- Solo responde como si fueras un profesor explicando justo lo que te preguntaron.

Recuerda: SOLO la respuesta en markdown, nada más.
`.trim();

  const text = await chatGemini(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    { maxTokens: 400, mimeType: "text/plain" }
  );

  const answer = String(text || "").trim();

  // No tocamos la lección: se mantiene igual
  const updatedLesson = {
    title: lesson.title,
    summary: lesson.summary,
    contentMD: lesson.contentMD,
    tips: Array.isArray(lesson.tips) ? lesson.tips : [],
    miniChallenge: lesson.miniChallenge || null,
  };

  return { answer, updatedLesson };
}
