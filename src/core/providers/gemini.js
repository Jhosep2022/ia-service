// src/ai/providers/gemini.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../ai/env.js";

function flattenMessages(messages) {
  const sys = messages.find(m => m.role === "system")?.content || null;
  const user = messages
    .filter(m => m.role !== "system")
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
  return { sys, user };
}

async function chatGemini(messages, { maxTokens = 400 } = {}) {
  if (!env.googleApiKey) throw new Error("Missing GOOGLE_API_KEY");

  const genAI = new GoogleGenerativeAI(env.googleApiKey);
  const { sys, user } = flattenMessages(messages);

  const model = genAI.getGenerativeModel({
    model: env.geminiModelId || "gemini-2.5-flash-lite",
    ...(sys ? { systemInstruction: sys } : {}),
    generationConfig: {
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
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
`;

  const text = await chatGemini(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    { maxTokens: 550 }
  );

  return JSON.parse(text);
}


export async function refineLessonWithQuestion({ lesson, question }) {
  const cleanQ = String(question || "").trim();
  if (!cleanQ) throw new Error("QUESTION_REQUIRED");

  // recortamos para no mandar un súper bloque
  const safeLesson = {
    title: String(lesson?.title || "").slice(0, 160),
    summary: String(lesson?.summary || "").slice(0, 800),
    contentMD: String(lesson?.contentMD || "").slice(0, 8000),
    tips: Array.isArray(lesson?.tips) ? lesson.tips.slice(0, 8) : [],
    miniChallenge: lesson?.miniChallenge || ""
  };

  const sys =
    "Eres un tutor experto en PROGRAMACIÓN para una plataforma e-learning. " +
    "Tu trabajo es ayudar a estudiantes a entender mejor una lección concreta " +
    "y proponer una versión mejorada del contenido. Debes responder SIEMPRE en español neutro. " +
    "Responde ÚNICAMENTE JSON válido.";

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

1) Responderle directamente al estudiante con una explicación clara, usando ejemplos de código
   coherentes con la lección (si la lección usa Java, sigue con Java; si usa Kotlin, sigue con Kotlin, etc.).
   Máximo 3 párrafos y puedes usar bloques de código markdown.

2) Proponer una VERSIÓN MEJORADA de la lección, sólo si realmente ayuda:
   - Mantén la estructura general (introducción, conceptos clave, ejemplo, mini-ejercicio).
   - Añade explicaciones donde pueda haber confusión.
   - No cambies el tema de la lección.

Devuelve EXACTAMENTE este JSON:

{
  "answer": "Respuesta al estudiante en español, con o sin código markdown.",
  "updatedLesson": {
    "title": "Título (puede ser el mismo o ligeramente mejorado)",
    "summary": "Resumen en 2–3 oraciones (hasta 300 caracteres).",
    "contentMD": "Markdown completo de la lección mejorada.",
    "tips": ["tip 1", "tip 2"],
    "miniChallenge": "Mini desafío alineado con la explicación."
  }
}

Reglas:
- Nada fuera de ese JSON.
- Si la pregunta no tiene que ver con programación o el contenido, de todos modos responde en 'answer'
  aclarando que solo atiendes dudas de programación y mantén updatedLesson muy similar al original.
`;

  const text = await chatGemini(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    { maxTokens: 2200 }
  );

  return JSON.parse(text);
}