// Secure server-side AI Website Generator.
//
// The browser only ever sends the user's prompt here. The Google AI Studio API
// key and model name are read ON THE SERVER from, in this order:
//   1. Realtime Database node  adminConfig/ai   { apiKey, model, enabled, maxOutputTokens? }
//      (written by the separate Admin Panel; no client rule should allow reading it)
//   2. Environment variables   GEMINI_API_KEY, GEMINI_MODEL
// Nothing about the key is ever returned to the client.

const { db, verifyIdToken } = require("../lib/firebaseAdmin");
const P = require("../lib/projects");

const HOURLY_LIMIT = 10;
const MAX_PROMPT = 4000;

const SYSTEM = `You are an expert front-end web developer and designer inside the Webora website builder.
Return a COMPLETE, working, multi-file static website as JSON.

Rules:
- Output real, editable source code only: HTML, CSS, JavaScript (plus optional JSON/SVG/TXT/MD). Never screenshots, never base64 images, never binary files.
- Always include "index.html" at the root. Put styles in "css/style.css" and scripts in "js/main.js" (add more files/pages when the request needs them, e.g. "about.html", "css/animations.css").
- Reference local files with RELATIVE paths (e.g. href="css/style.css", src="js/main.js", href="about.html"). Never start paths with "/".
- Use inline SVG, CSS gradients and emoji for visuals instead of image files. No external images. Google Fonts <link> tags are allowed. No other external libraries unless essential.
- Make it responsive (mobile-first), accessible (semantic HTML, alt text, contrast), modern and polished, with tasteful CSS animations and working JavaScript interactions.
- Every page must link to its CSS/JS correctly and navigation links between pages must work.
- Do not include server-side code, forms that post to external services, tracking, or API keys.
- File paths: letters, numbers, dashes, underscores, dots and slashes only; no hidden files.
- Keep the whole project reasonably compact (under ~120 KB of text).`;

async function readConfig() {
  let cfg = {};
  try { cfg = (await db().ref("adminConfig/ai").get()).val() || {}; } catch (e) { cfg = {}; }
  const apiKey = cfg.apiKey || process.env.GEMINI_API_KEY || "";
  const model = String(cfg.model || process.env.GEMINI_MODEL || "").trim();
  const enabled = cfg.enabled !== false;
  return { apiKey, model, enabled, maxOutputTokens: Number(cfg.maxOutputTokens) || 32768 };
}

async function checkRate(uid) {
  const bucket = Math.floor(Date.now() / 3600000);
  const ref = db().ref(`aiUsage/${uid}/${bucket}`);
  const n = (await ref.get()).val() || 0;
  if (n >= HOURLY_LIMIT) {
    const err = new Error(`Generation limit reached (${HOURLY_LIMIT} per hour). Please try again later.`);
    err.status = 429;
    throw err;
  }
  await ref.set(n + 1);
}

// Turns the model's JSON into validated project files.
function validateResult(raw) {
  let data;
  try { data = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { throw P.httpError(502, "The AI returned an unreadable response. Please retry."); }
  const list = data && Array.isArray(data.files) ? data.files : [];
  const out = [];
  const seen = new Set();
  let total = 0;
  for (const f of list) {
    if (!f || typeof f.path !== "string") continue;
    let path;
    try { path = P.normalizePath(f.path); } catch (e) { continue; }
    if (!P.isTextPath(path) || seen.has(path)) continue;
    const content = String(f.content == null ? "" : f.content);
    const size = Buffer.byteLength(content, "utf8");
    if (size > P.LIMITS.maxFileBytes) continue;
    total += size;
    if (total > P.LIMITS.maxTotalBytes || out.length >= 60) break;
    seen.add(path);
    out.push({ path, content });
  }
  if (!out.some((f) => f.path === "index.html")) throw P.httpError(502, "The AI did not produce an index.html. Please retry.");
  return { summary: String((data && data.summary) || "").slice(0, 500), files: out };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const user = await verifyIdToken(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const prompt = String(body.prompt || "").trim();
    if (prompt.length < 8) return res.status(400).json({ error: "Describe the website you want (at least a few words)." });
    if (prompt.length > MAX_PROMPT) return res.status(400).json({ error: `Prompt is too long (max ${MAX_PROMPT} characters).` });

    const cfg = await readConfig();
    if (!cfg.enabled) return res.status(503).json({ error: "The AI generator is currently turned off by the administrator." });
    if (!cfg.apiKey || !cfg.model) return res.status(503).json({ error: "The AI generator isn't configured yet. The administrator must set an API key and model in the Admin Panel." });

    await checkRate(user.uid);

    // optional context when the user asks the AI to change an existing project
    let userText = `Build this website:\n${prompt}`;
    if (Array.isArray(body.existing) && body.existing.length) {
      let budget = 60000;
      const parts = [];
      for (const f of body.existing.slice(0, 30)) {
        if (!f || typeof f.path !== "string" || !P.isTextPath(f.path)) continue;
        const c = String(f.content || "").slice(0, Math.min(budget, 20000));
        budget -= c.length;
        if (budget <= 0) break;
        parts.push(`--- ${f.path} ---\n${c}`);
      }
      if (parts.length) userText = `Here are the current project files:\n${parts.join("\n")}\n\nApply this request and return the FULL updated set of files (all files, complete content):\n${prompt}`;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55000);
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: cfg.maxOutputTokens,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                summary: { type: "STRING" },
                files: {
                  type: "ARRAY",
                  items: { type: "OBJECT", properties: { path: { type: "STRING" }, content: { type: "STRING" } }, required: ["path", "content"] },
                },
              },
              required: ["files"],
            },
          },
        }),
      });
    } catch (e) {
      if (e.name === "AbortError") return res.status(504).json({ error: "The AI took too long to respond. Please retry with a shorter prompt." });
      throw e;
    } finally {
      clearTimeout(timer);
    }

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("AI provider error", r.status, JSON.stringify(j).slice(0, 300));
      const code = r.status === 429 ? 503 : 502;
      return res.status(code).json({ error: r.status === 429 ? "The AI service is busy right now. Please retry in a moment." : "The AI service returned an error. Please retry." });
    }
    const text = ((j.candidates || [])[0]?.content?.parts || []).map((p) => p.text || "").join("");
    if (!text) return res.status(502).json({ error: "The AI returned an empty response. Please retry." });
    return res.status(200).json({ ok: true, ...validateResult(text) });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error(e);
    return res.status(e.status || 500).json({ error: e.message || "Generation failed." });
  }
};
module.exports.validateResult = validateResult;
