// Shared helpers for turning a public "site path" like `myuser.webora.app`
// into a Firebase-safe database key, and back.
// Firebase Realtime Database keys cannot contain: . $ # [ ] /
// so dots in the chosen suffix are swapped for `~dot~` internally.

const RESERVED = ["api", "sitemap", "robots", "favicon", "_vercel", "assets", "lib", "login", "register", "dashboard", "create", "edit", "api-key", "api-docs"];
const SUFFIXES = ["webora.app", "webora.online", "webora.site"];

const BASE_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

function isValidBase(base) {
  return BASE_RE.test(base) && !RESERVED.includes(base);
}

// Accepts the raw path segment exactly as it appears in the URL, e.g.
//   "myuser" or "myuser.webora.app"
// Returns { ok, base, suffix, path } or { ok:false }
function parsePath(raw) {
  const path = String(raw || "").trim().toLowerCase();
  if (!path) return { ok: false };

  const dot = path.indexOf(".");
  if (dot === -1) {
    if (!isValidBase(path)) return { ok: false };
    return { ok: true, base: path, suffix: null, path };
  }

  const base = path.slice(0, dot);
  const suffix = path.slice(dot + 1);
  if (!isValidBase(base)) return { ok: false };
  if (!SUFFIXES.includes(suffix)) return { ok: false };
  return { ok: true, base, suffix, path: `${base}.${suffix}` };
}

// Build the canonical path string from a base + optional suffix choice.
function buildPath(base, suffix) {
  base = String(base || "").trim().toLowerCase();
  if (!suffix || suffix === "none") return base;
  return `${base}.${suffix}`;
}

// Database key is just the path with dots swapped out (RTDB disallows '.').
function pathToKey(path) {
  return String(path).replace(/\./g, "~dot~");
}

function keyToPath(key) {
  return String(key).replace(/~dot~/g, ".");
}

module.exports = { RESERVED, SUFFIXES, isValidBase, parsePath, buildPath, pathToKey, keyToPath };
