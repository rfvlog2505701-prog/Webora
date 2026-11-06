
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
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // ~6MB raw, matches Gemini's practical inline-image limit
const IMAGE_MIME_RE = /^image\/(png|jpe?g|webp|gif)$/i;

// A reference image (screenshot, mockup, logo, brand photo) the user attached
// to the prompt — used only as visual/style guidance, never embedded as a
// file in the generated project (see SYSTEM prompt below).
function validateImage(img) {
  if (!img || typeof img !== "object") return null;
  const mimeType = String(img.mimeType || "").toLowerCase();
  const data = String(img.data || "");
  if (!IMAGE_MIME_RE.test(mimeType)) throw P.httpError(400, "Reference image must be PNG, JPEG, WEBP or GIF.");
  if (!data) throw P.httpError(400, "Reference image data is empty.");
  const approxBytes = Math.floor((data.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) throw P.httpError(413, "Reference image is too large (max ~6MB).");
  return { mimeType, data };
}
// Generating a full multi-file website can genuinely take a while — this is
// NOT a sign anything is "too long" or broken, the model is just writing a
// lot of code. Give it real room before giving up (paired with a bigger
// Vercel maxDuration in vercel.json). Streaming (below) also means the user
// sees files appear as they're written instead of staring at a blank timer.
const AI_TIMEOUT = 280000;

// --------------------------------------------------
// SYSTEM PROMPT
// --------------------------------------------------

const SYSTEM = `You are an expert front-end web developer and designer inside the Webora website builder.
Return a COMPLETE, working, multi-file static website as JSON (an array of {path, content} files).

===========================================================
HYBRID FILE STRUCTURE — follow this exactly, every time
===========================================================
Build a real multi-file project, never one giant HTML file with everything crammed inline.
- "index.html" is REQUIRED at the project root. It is the home page.
- ONE PAGE = ONE FILE. Every distinct view/section the user would think of as its own
  page (About, Services, Pricing, Contact, a blog post, …) is its own "*.html" file
  at the root or in a folder (e.g. "about.html", "blog/post-1.html") — do not fake
  multiple "pages" as hidden <div>s inside a single index.html.
- Shared styling goes in "css/style.css"; if a page needs extra styling of its own,
  add a second file (e.g. "css/pricing.css") rather than piling unrelated rules into
  one huge stylesheet.
- Shared behavior goes in "js/main.js"; split out a second file (e.g. "js/form.js")
  when a feature is substantial enough to deserve its own file.
- Any structured data the page reads (pricing tiers, FAQ entries, gallery items,
  testimonials, nav links) belongs in its OWN "*.json" file (e.g. "data/faq.json"),
  loaded with fetch("data/faq.json") — never hand-roll large data literals inline
  in the JS when a JSON file is clearer.
- Every icon or illustration is its OWN "*.svg" file (e.g. "images/icon-star.svg"),
  referenced with <img src="images/icon-star.svg"> or inlined only when the icon
  must change color/animate with CSS. Don't base64-encode icons into the HTML.
- Reference your own files with RELATIVE paths only (e.g. href="css/style.css",
  src="js/main.js", href="about.html", fetch("data/faq.json")). Never start a path
  with "/" and never invent an absolute domain for your own files.

===========================================================
ENVIRONMENT VARIABLES — use this exact pattern
===========================================================
Webora Studio has an "Env" panel where the project owner can define Config/Secret
variables. Config variables are injected into the published page as a global
object at runtime: window.ENV. If the website needs something that is naturally
a setting rather than hardcoded content — an API base URL, a public client ID,
a feature flag, a contact email used by a form action — read it like this, and
ALWAYS guard against it being unset:

  const API_BASE = (window.ENV && window.ENV.API_BASE_URL) || "";
  if (!API_BASE) {
    console.warn("API_BASE_URL is not set — add it in Studio's Env panel.");
  }

Never hardcode a real secret/API key directly in HTML or JS "to make it work" —
there is no server here to keep a secret hidden. If the site genuinely needs one,
reference it via window.ENV.YOUR_KEY_NAME and mention in your summary that the
user should add YOUR_KEY_NAME as a Config variable in the Env panel.

===========================================================
CORRECTNESS — this is what most often breaks a generated site
===========================================================
A site that looks right in the prompt but breaks the moment it's opened is worse
than a simpler site that works. Before finishing, mentally check every file for:
- Every opening HTML tag has a matching closing tag; every <script>/<style> block
  is properly closed; no stray "</div>" with no matching opener.
- No trailing commas in JSON files or in JS object/array literals.
- Every string is properly quoted and escaped; no unescaped quotes inside strings.
- Every function/bracket/parenthesis you open is closed — scan each JS file
  top to bottom once before outputting it.
- JS that touches localStorage, sessionStorage, fetch, or any browser API that can
  throw MUST be wrapped in try/catch (or guarded with an existence check) so one
  failing feature doesn't stop the rest of the page's scripts from running.
- Don't reference a file (css/js/image/json) you didn't actually create.
- Test the logic mentally: if a button calls a function, that function must exist
  in a file that is actually loaded on that page.

===========================================================
GENERAL RULES
===========================================================
- Output real, editable source code only: HTML, CSS, JavaScript (plus optional JSON/SVG/TXT/MD). Never screenshots, never base64 images, never binary files.
- Use inline SVG, CSS gradients and emoji for visuals instead of photographic images. No external image URLs. Google Fonts <link> tags are allowed. No other external libraries unless essential.
- Make it responsive (mobile-first), accessible (semantic HTML, alt text, contrast), modern and polished, with tasteful CSS animations and working JavaScript interactions.
- Every page must link to its CSS/JS correctly and navigation links between pages must actually work (relative hrefs to the real files you created).
- Do not include server-side code, forms that post to external services, tracking, or API keys.
- File paths: letters, numbers, dashes, underscores, dots and slashes only; no hidden files.
- Keep the whole project reasonably compact (under ~120 KB of text).
- If an image was provided with the request, use it only as visual/style reference (layout, color palette, mood, component shapes) for the design you generate — never embed the image itself as a file.`;

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

function userParts(userText, image) {
  const parts = [{ text: userText }];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  return parts;
}

async function generateWithKeyRotation(cfg, userText, image) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;

  const requestBody = JSON.stringify({
    systemInstruction: {
      parts: [{ text: SYSTEM }]
    },

    contents: [
      {
        role: "user",
        parts: userParts(userText, image)
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
// STREAMING GENERATION (SSE) — same key-rotation logic as above, but reads
// Gemini's :streamGenerateContent response incrementally and forwards each
// text delta to the caller via onDelta(). Key rotation only happens BEFORE
// we commit to a key's stream (i.e. based on the initial HTTP response),
// exactly like the non-streaming path — once bytes start flowing we stick
// with that key.
// --------------------------------------------------

async function generateWithKeyRotationStream(cfg, userText, onDelta, image) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`;

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: userParts(userText, image) }],
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
  });

  const deadline = Date.now() + AI_TIMEOUT;
  let lastStatus = 0, sawQuotaError = false;

  for (let i = 0; i < cfg.apiKeys.length; i++) {
    const apiKey = cfg.apiKeys[i];
    const remaining = deadline - Date.now();
    if (remaining <= 1000) {
      const err = new Error("The AI took too long to respond. Please retry.");
      err.status = 504; throw err;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), remaining);
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: requestBody,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") {
        const err = new Error("The AI took too long to respond. Please retry with a shorter prompt.");
        err.status = 504; throw err;
      }
      throw e;
    }

    if (!response.ok) {
      clearTimeout(timer);
      const data = await response.json().catch(() => ({}));
      lastStatus = response.status;
      if (response.status === 429) sawQuotaError = true;
      if (shouldTryNextKey(response.status, data)) {
        if (i < cfg.apiKeys.length - 1) continue;
        break;
      }
      const err = new Error("The AI service returned an error. Please retry.");
      err.status = 502; throw err;
    }

    // Committed to this key — stream the response body through.
    let total = "";
    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let obj; try { obj = JSON.parse(payload); } catch (e) { continue; }
          const parts = ((obj.candidates || [])[0] || {}).content?.parts || [];
          const delta = parts.map((p) => p.text || "").join("");
          if (delta) { total += delta; onDelta(delta, total); }
        }
      }
    } catch (e) {
      if (e.name === "AbortError") {
        const err = new Error("The AI took too long to respond. Please retry.");
        err.status = 504; throw err;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }

    if (!total) {
      const err = new Error("The AI returned an empty response. Please retry.");
      err.status = 502; throw err;
    }
    return total;
  }

  if (sawQuotaError || lastStatus === 429) {
    const err = new Error("All available Gemini API keys are currently busy or have reached their quota. Please try again later.");
    err.status = 503; throw err;
  }
  const err = new Error("All Gemini API keys failed authentication. Please check your API keys and permissions.");
  err.status = 502; throw err;
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

  const body =
    typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : req.body || {};

  const wantsStream = body.stream === true || /text\/event-stream/.test(req.headers.accept || "");

  if (!wantsStream) return handleOnce(req, res, body);

  // ---- streaming (SSE) path ----
  let streamStarted = false;
  const start = () => {
    if (streamStarted) return;
    streamStarted = true;
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
  };
  const send = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (e) { /* client gone */ } };

  try {
    const user = await verifyIdToken(req);
    const prompt = String(body.prompt || "").trim();
    if (prompt.length < 8) throw P.httpError(400, "Describe the website you want (at least a few words).");
    if (prompt.length > MAX_PROMPT) throw P.httpError(400, `Prompt is too long (max ${MAX_PROMPT} characters).`);
    const image = validateImage(body.image);

    const cfg = await readConfig();
    if (!cfg.enabled) throw P.httpError(503, "The AI generator is currently turned off by the administrator.");
    if (!cfg.apiKeys.length || !cfg.model) throw P.httpError(503, "The AI generator isn't configured. Add Gemini API keys and a model in Vercel Environment Variables or the Admin Panel.");

    await checkRate(user.uid);

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

    start();
    const fullText = await generateWithKeyRotationStream(cfg, userText, (delta, total) => {
      send({ type: "delta", text: delta, full: total, total: total.length });
    }, image);
    const result = validateResult(fullText);
    send({ type: "done", ok: true, ...result });
    return res.end();
  } catch (e) {
    if (!e.status || e.status >= 500) console.error(e);
    if (!streamStarted) {
      return res.status(e.status || 500).json({ error: e.message || "Generation failed." });
    }
    send({ type: "error", status: e.status || 500, message: e.message || "Generation failed." });
    return res.end();
  }
};

async function handleOnce(req, res, body) {
  try {
    const user = await verifyIdToken(req);

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

    let image;
    try { image = validateImage(body.image); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

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
      userText,
      image
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
module.exports.generateWithKeyRotationStream = generateWithKeyRotationStream;
