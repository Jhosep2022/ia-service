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
 *  - updatedLesson con contentMD casi siempre igual al original
 */
export async function refineLessonWithQuestion({ lesson, question }) {
  const cleanQ = String(question || "").trim();
  if (!cleanQ) throw new Error("QUESTION_REQUIRED");

  // Recortamos para no mandar bloques gigantes
  const safeLesson = {
    title: String(lesson?.title || "").slice(0, 160),
    summary: String(lesson?.summary || "").slice(0, 800),
    contentMD: String(lesson?.contentMD || "").slice(0, 8000),
    tips: Array.isArray(lesson?.tips) ? lesson.tips.slice(0, 8) : [],
    miniChallenge: lesson?.miniChallenge || "",
  };

  const sys =
    "Eres un tutor experto en PROGRAMACIÓN para una plataforma e-learning. " +
    "Te comportas como un BOT DE DUDAS personal de la lección. " +
    "Respondes SIEMPRE en español neutro. Devuelves SOLO TEXTO PLANO, nunca JSON.";

  const user = `
Tienes la siguiente LECCIÓN actual (markdown recortado):

---
Title: ${safeLesson.title}
Summary: ${safeLesson.summary}

CONTENT_MD:
${safeLesson.contentMD}

Tips actuales: ${JSON.stringify(safeLesson.tips)}
MiniChallenge actual: ${safeLesson.miniChallenge}
---

El estudiante hace esta pregunta o pide aclaración:

"${cleanQ}"

Tu tarea:

1) Responder directamente al estudiante con una explicación clara y MUY CONCRETA,
   usando ejemplos de código coherentes con la lección (si la lección usa JavaScript, sigue con JavaScript, etc.).
   La respuesta debe ser CORTA:
   - Máximo 2–3 párrafos
   - Máximo ~10 líneas en total
   - Opcionalmente UN solo bloque de código corto (\`\`\`<lenguaje>\`\`\`) de 4–8 líneas si el estudiante pide ejemplos.

2) No reescribas toda la lección. Solo es un chat de dudas.
   La lección se mantiene casi igual. Solo si ves un error grave puedes sugerir una minúscula mejora.

FORMATO DE SALIDA EXACTO (TEXTO PLANO, SIN JSON):

===ANSWER_START===
<respuesta breve al estudiante en markdown, opcionalmente con 1 bloque de código corto>
===ANSWER_END===
===UPDATED_LESSON_MD_START===
<markdown de la lección. En la mayoría de los casos, copia EXACTAMENTE el CONTENT_MD original.
Solo añade como mucho una nota muy corta al final si es estrictamente necesario.>
===UPDATED_LESSON_MD_END===

Reglas:
- En ANSWER no repitas toda la teoría de la lección, solo responde a lo que el estudiante pidió.
- ANSWER debe ser mucho más corta que toda la lección.
- En UPDATED_LESSON_MD normalmente copia el CONTENT_MD original sin cambios.
- No escribas nada fuera de esos bloques.
`.trim();

  const text = await chatGemini(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    { maxTokens: 700, mimeType: "text/plain" }
  );

  // Parseamos bloques
  const reAnswer = /===ANSWER_START===([\s\S]*?)===ANSWER_END===/;
  const reUpdated =
    /===UPDATED_LESSON_MD_START===([\s\S]*?)===UPDATED_LESSON_MD_END===/;

  const mAns = text.match(reAnswer);
  const mUpd = text.match(reUpdated);

  const answer = (mAns?.[1] || text).trim(); // si falla, usamos todo el texto como answer
  const updatedContentMD = (mUpd?.[1] || "").trim();

  // Si la IA no devuelve nada razonable para updated, mantenemos la lección original
  const finalContentMD = updatedContentMD || String(lesson.contentMD || "");

  const updatedLesson = {
    title: lesson.title,
    summary: lesson.summary,
    contentMD: finalContentMD,
    tips: Array.isArray(lesson.tips) ? lesson.tips : [],
    miniChallenge: lesson.miniChallenge || null,
  };

  return { answer, updatedLesson };
}
