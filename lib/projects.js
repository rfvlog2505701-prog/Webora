// Shared rules for multi-file projects: path safety, allowed types, limits,
// RTDB-safe keys. Used by api/projects.js, api/ai.js and api/site.js.

const LIMITS = {
  // No cap on how many projects/websites an account can have (per owner's
  // request). maxFiles/maxFileBytes/maxTotalBytes stay — they protect a
  // single project from blowing past Vercel's request-size limits, not a
  // "number of sites" restriction.
  maxProjectsPerUser: Infinity,
  maxFiles: 300,
  maxFileBytes: 2.5 * 1024 * 1024, // per file (raw bytes) — keeps each request under Vercel's 4.5MB body cap
  maxTotalBytes: 8 * 1024 * 1024, // per project (raw bytes)
  maxPathLength: 200,
  maxDepth: 10,
  maxVersions: 25,
};

const TEXT_EXT = new Set(["html", "htm", "css", "js", "mjs", "json", "txt", "md", "xml", "svg", "webmanifest", "csv", "map"]);
const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp3", "wav", "ogg", "mp4", "webm", "pdf",
]);

const MIME = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8", txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8",
  xml: "application/xml; charset=utf-8", svg: "image/svg+xml", webmanifest: "application/manifest+json",
  csv: "text/csv; charset=utf-8", map: "application/json; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  bmp: "image/bmp", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm", pdf: "application/pdf",
};

function extOf(p) {
  const base = String(p).split("/").pop();
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i + 1).toLowerCase();
}
const isTextPath = (p) => TEXT_EXT.has(extOf(p));
const isAllowedPath = (p) => TEXT_EXT.has(extOf(p)) || BINARY_EXT.has(extOf(p));
const mimeOf = (p) => MIME[extOf(p)] || "application/octet-stream";

function httpError(status, message, extra) {
  const e = new Error(message);
  e.status = status;
  if (extra) e.extra = extra;
  return e;
}

// Turns user input into a clean relative path, or throws 400.
// Rejects traversal (..), absolute paths, backslash tricks, control chars,
// hidden segments (.git, .DS_Store …) and overly deep/long paths.
function normalizePath(raw, { allowEmpty = false } = {}) {
  let p = String(raw == null ? "" : raw).replace(/\\/g, "/").trim();
  p = p.replace(/^(\.\/)+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!p) {
    if (allowEmpty) return "";
    throw httpError(400, "Path is empty.");
  }
  if (p.length > LIMITS.maxPathLength) throw httpError(400, "Path is too long: " + p.slice(0, 40) + "…");
  const parts = p.split("/");
  if (parts.length > LIMITS.maxDepth) throw httpError(400, "Folders are nested too deeply: " + p);
  for (const seg of parts) {
    if (!seg || seg === "." || seg === "..") throw httpError(400, "Unsafe path: " + p);
    if (seg.startsWith(".")) throw httpError(400, "Hidden files and folders are not allowed: " + p);
    if (/[\u0000-\u001f\u007f<>:"|?*\\]/.test(seg)) throw httpError(400, "Invalid characters in path: " + p);
    if (seg.length > 120) throw httpError(400, "A file or folder name is too long.");
  }
  return parts.join("/");
}

// RTDB keys can't contain . $ # [ ] / — base64url is always safe.
const fileKey = (path) => Buffer.from(path, "utf8").toString("base64url");
const keyToFile = (key) => Buffer.from(key, "base64url").toString("utf8");

const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

// Validates one incoming file {path, content, enc} and returns the record to
// store. `enc` is "utf8" (string content) or "base64".
function buildFileRecord(input) {
  const path = normalizePath(input.path);
  if (!isAllowedPath(path)) {
    throw httpError(400, `File type not allowed: ${path}`);
  }
  const text = isTextPath(path);
  let enc = input.enc === "base64" ? "base64" : "utf8";
  if (text && enc !== "utf8") throw httpError(400, `${path} must be sent as text.`);
  if (!text && enc !== "base64") throw httpError(400, `${path} must be sent as base64.`);
  const data = input.content == null ? "" : String(input.content);
  let size;
  if (enc === "utf8") {
    size = Buffer.byteLength(data, "utf8");
  } else {
    if (!B64_RE.test(data) || data.length % 4 === 1) throw httpError(400, `Corrupt binary data for ${path}.`);
    size = Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  }
  if (size > LIMITS.maxFileBytes) {
    throw httpError(413, `${path} is larger than ${(LIMITS.maxFileBytes / 1048576).toFixed(1)} MB.`);
  }
  return { path, enc, data, size };
}

function sanitizeName(s, fallback = "Untitled project") {
  const n = String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);
  return n || fallback;
}

const STARTER_FILES = [
  {
    path: "index.html",
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Website</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <main class="hero">
    <h1>Hello, Webora!</h1>
    <p>Edit <code>index.html</code>, <code>css/style.css</code> and <code>js/main.js</code> to build your site.</p>
    <button id="btn">Click me</button>
  </main>
  <script src="js/main.js"></script>
</body>
</html>
`,
  },
  {
    path: "css/style.css",
    content: `:root { --blue: #3b6cf5; --ink: #0f172a; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; color: var(--ink); background: #f8fafc; }
.hero { min-height: 100vh; display: grid; place-content: center; text-align: center; gap: 12px; padding: 24px; }
.hero h1 { font-size: clamp(2rem, 6vw, 3.5rem); margin: 0; color: var(--blue); }
button { background: var(--blue); color: #fff; border: 0; padding: 12px 22px; border-radius: 10px; font-size: 1rem; cursor: pointer; }
`,
  },
  {
    path: "js/main.js",
    content: `document.getElementById("btn").addEventListener("click", () => {
  alert("It works!");
});
`,
  },
];

module.exports = {
  LIMITS, TEXT_EXT, BINARY_EXT, MIME, STARTER_FILES,
  extOf, isTextPath, isAllowedPath, mimeOf, httpError, normalizePath,
  fileKey, keyToFile, buildFileRecord, sanitizeName,
};
