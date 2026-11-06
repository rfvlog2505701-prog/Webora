
// Secure server-side AI Website Generator
// Supports multiple Gemini API keys with automatic key rotation.
//
// API key priority:
// 1. Vercel: GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3 ...
// 2. Realtime Database: adminConfig/ai.apiKeys[]
// 3. Realtime Database: adminConfig/ai.apiKey (legacy)
// 4. Vercel: GEMINI_API_KEY (legacy)
//
// Model priority:
// 1. Realtime Database: adminConfig/ai.model
// 2. Vercel: GEMINI_MODEL
//
// API keys are NEVER returned to the browser.

const { db, verifyIdToken } = require("../lib/firebaseAdmin");
const P = require("../lib/projects");

const HOURLY_LIMIT = 10;
const MAX_PROMPT = 4000;
const AI_TIMEOUT = 55000;

// --------------------------------------------------
// SYSTEM PROMPT
// --------------------------------------------------

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

// --------------------------------------------------
// API KEY HELPERS
// --------------------------------------------------

function uniqueKeys(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = String(value || "").trim();

    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(key);
  }

  return result;
}

function getNumberedEnvironmentKeys() {
  return Object.keys(process.env)
    .map((name) => {
      const match = name.match(/^GEMINI_API_KEY_(\d+)$/i);

      if (!match) return null;

      return {
        index: Number(match[1]),
        value: process.env[name]
      };
    })
    .filter((item) => item && item.value)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.value);
}

// --------------------------------------------------
// READ AI CONFIGURATION
// --------------------------------------------------

async function readConfig() {
  let cfg = {};

  try {
    cfg = (await db().ref("adminConfig/ai").get()).val() || {};
  } catch (e) {
    cfg = {};
  }

  const environmentKeys = getNumberedEnvironmentKeys();

  const databaseKeys = Array.isArray(cfg.apiKeys)
    ? cfg.apiKeys
    : [];

  const apiKeys = uniqueKeys([
    ...environmentKeys,
    ...databaseKeys,
    cfg.apiKey,
    process.env.GEMINI_API_KEY
  ]);

  const model = String(
    cfg.model || process.env.GEMINI_MODEL || ""
  ).trim();

  const enabled = cfg.enabled !== false;

  return {
    apiKeys,
    model,
    enabled,
    maxOutputTokens: Number(cfg.maxOutputTokens) || 32768
  };
}

// --------------------------------------------------
// RATE LIMIT
// --------------------------------------------------

async function checkRate(uid) {
  const bucket = Math.floor(Date.now() / 3600000);
  const ref = db().ref(`aiUsage/${uid}/${bucket}`);

  const n = (await ref.get()).val() || 0;

  if (n >= HOURLY_LIMIT) {
    const err = new Error(
      `Generation limit reached (${HOURLY_LIMIT} per hour). Please try again later.`
    );

    err.status = 429;
    throw err;
  }

  await ref.set(n + 1);
}

// --------------------------------------------------
// DETECT API KEY ERRORS
// --------------------------------------------------

function isInvalidKeyError(status, data) {
  if (status === 401 || status === 403) {
    return true;
  }

  if (status !== 400) {
    return false;
  }

  const message = String(
    data?.error?.message || ""
  ).toLowerCase();

  const errorStatus = String(
    data?.error?.status || ""
  ).toLowerCase();

  return (
    message.includes("api key") ||
    message.includes("api_key_invalid") ||
    message.includes("invalid key") ||
    errorStatus.includes("unauthenticated") ||
    errorStatus.includes("permission_denied")
  );
}

function shouldTryNextKey(status, data) {
  return (
    status === 429 ||
    status === 401 ||
    status === 403 ||
    isInvalidKeyError(status, data)
  );
}

// --------------------------------------------------
// GEMINI REQUEST WITH AUTOMATIC KEY ROTATION
// --------------------------------------------------

async function generateWithKeyRotation(cfg, userText) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;

  const requestBody = JSON.stringify({
    systemInstruction: {
      parts: [{ text: SYSTEM }]
    },

    contents: [
      {
        role: "user",
        parts: [{ text: userText }]
      }
    ],

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

            items: {
              type: "OBJECT",

              properties: {
                path: { type: "STRING" },
                content: { type: "STRING" }
              },

              required: ["path", "content"]
            }
          }
        },

        required: ["files"]
      }
    }
  });

  const deadline = Date.now() + AI_TIMEOUT;

  let lastStatus = 0;
  let sawQuotaError = false;

  for (let i = 0; i < cfg.apiKeys.length; i++) {
    const apiKey = cfg.apiKeys[i];

    const remaining = deadline - Date.now();

    if (remaining <= 1000) {
      const err = new Error(
        "The AI took too long to respond. Please retry."
      );

      err.status = 504;
      throw err;
    }

    console.log(
      `Gemini request: trying API key ${i + 1} of ${cfg.apiKeys.length}`
    );

    const ctrl = new AbortController();

    const timer = setTimeout(
      () => ctrl.abort(),
      remaining
    );

    let response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        signal: ctrl.signal,

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },

        body: requestBody
      });

    } catch (e) {
      if (e.name === "AbortError") {
        const err = new Error(
          "The AI took too long to respond. Please retry with a shorter prompt."
        );

        err.status = 504;
        throw err;
      }

      throw e;

    } finally {
      clearTimeout(timer);
    }

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      console.log(
        `Gemini request successful using API key ${i + 1}`
      );

      return data;
    }

    lastStatus = response.status;

    if (response.status === 429) {
      sawQuotaError = true;
    }

    console.error(
      `Gemini API key ${i + 1} failed with status ${response.status}`
    );

    // Try the next API key for quota, rate-limit
    // or authentication-related errors.

    if (shouldTryNextKey(response.status, data)) {
      if (i < cfg.apiKeys.length - 1) {
        console.log("Trying the next Gemini API key...");
        continue;
      }

      break;
    }

    // Do not rotate keys for unrelated errors.
    const err = new Error(
      "The AI service returned an error. Please retry."
    );

    err.status = 502;
    throw err;
  }

  if (sawQuotaError || lastStatus === 429) {
    const err = new Error(
      "All available Gemini API keys are currently busy or have reached their quota. Please try again later."
    );

    err.status = 503;
    throw err;
  }

  const err = new Error(
    "All Gemini API keys failed authentication. Please check your API keys and permissions."
  );

  err.status = 502;
  throw err;
}

// --------------------------------------------------
// VALIDATE AI RESPONSE
// --------------------------------------------------

function validateResult(raw) {
  let data;

  try {
    data = typeof raw === "string"
      ? JSON.parse(raw)
      : raw;

  } catch (e) {
    throw P.httpError(
      502,
      "The AI returned an unreadable response. Please retry."
    );
  }

  const list =
    data && Array.isArray(data.files)
      ? data.files
      : [];

  const out = [];
  const seen = new Set();

  let total = 0;

  for (const f of list) {
    if (!f || typeof f.path !== "string") continue;

    let path;

    try {
      path = P.normalizePath(f.path);
    } catch (e) {
      continue;
    }

    if (!P.isTextPath(path) || seen.has(path)) {
      continue;
    }

    const content = String(
      f.content == null ? "" : f.content
    );

    const size = Buffer.byteLength(content, "utf8");

    if (size > P.LIMITS.maxFileBytes) {
      continue;
    }

    total += size;

    if (
      total > P.LIMITS.maxTotalBytes ||
      out.length >= 60
    ) {
      break;
    }

    seen.add(path);

    out.push({
      path,
      content
    });
  }

  if (!out.some((f) => f.path === "index.html")) {
    throw P.httpError(
      502,
      "The AI did not produce an index.html. Please retry."
    );
  }

  return {
    summary: String(
      (data && data.summary) || ""
    ).slice(0, 500),

    files: out
  };
}

// --------------------------------------------------
// MAIN API HANDLER
// --------------------------------------------------

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only"
    });
  }

  try {
    const user = await verifyIdToken(req);

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const prompt = String(
      body.prompt || ""
    ).trim();

    if (prompt.length < 8) {
      return res.status(400).json({
        error: "Describe the website you want (at least a few words)."
      });
    }

    if (prompt.length > MAX_PROMPT) {
      return res.status(400).json({
        error: `Prompt is too long (max ${MAX_PROMPT} characters).`
      });
    }

    const cfg = await readConfig();

    if (!cfg.enabled) {
      return res.status(503).json({
        error: "The AI generator is currently turned off by the administrator."
      });
    }

    if (!cfg.apiKeys.length || !cfg.model) {
      return res.status(503).json({
        error: "The AI generator isn't configured. Add Gemini API keys and a model in Vercel Environment Variables or the Admin Panel."
      });
    }

    // One generation counts as one request,
    // even when several API keys are attempted.

    await checkRate(user.uid);

    // Existing project context support.

    let userText = `Build this website:\n${prompt}`;

    if (
      Array.isArray(body.existing) &&
      body.existing.length
    ) {
      let budget = 60000;

      const parts = [];

      for (const f of body.existing.slice(0, 30)) {
        if (
          !f ||
          typeof f.path !== "string" ||
          !P.isTextPath(f.path)
        ) {
          continue;
        }

        const c = String(f.content || "").slice(
          0,
          Math.min(budget, 20000)
        );

        budget -= c.length;

        if (budget <= 0) break;

        parts.push(
          `--- ${f.path} ---\n${c}`
        );
      }

      if (parts.length) {
        userText =
          `Here are the current project files:\n` +
          `${parts.join("\n")}\n\n` +
          `Apply this request and return the FULL updated set of files (all files, complete content):\n` +
          `${prompt}`;
      }
    }

    // Automatically rotate keys when necessary.

    const result = await generateWithKeyRotation(
      cfg,
      userText
    );

    const text = (
      (result.candidates || [])[0]?.content?.parts || []
    )
      .map((p) => p.text || "")
      .join("");

    if (!text) {
      return res.status(502).json({
        error: "The AI returned an empty response. Please retry."
      });
    }

    return res.status(200).json({
      ok: true,
      ...validateResult(text)
    });

  } catch (e) {
    if (!e.status || e.status >= 500) {
      console.error(e);
    }

    return res.status(e.status || 500).json({
      error: e.message || "Generation failed."
    });
  }
};

// Keep validateResult available for testing.
module.exports.validateResult = validateResult;

// Export helpers for optional testing.
module.exports.readConfig = readConfig;
module.exports.generateWithKeyRotation = generateWithKeyRotation;
