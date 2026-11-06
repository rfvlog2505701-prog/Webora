// Client-side mirror of lib/projects.js rules (the server re-validates everything).
export const LIMITS = { maxFiles: 300, maxFileBytes: 2.5 * 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024, maxPathLength: 200, maxDepth: 10, maxZipBytes: 25 * 1024 * 1024, maxZipEntries: 1500, requestBytes: 2.2 * 1024 * 1024 };
const TEXT = new Set(["html", "htm", "css", "js", "mjs", "json", "txt", "md", "xml", "svg", "webmanifest", "csv", "map"]);
const BIN = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "woff", "woff2", "ttf", "otf", "eot", "mp3", "wav", "ogg", "mp4", "webm", "pdf"]);
const MIME = {
  html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript", json: "application/json", txt: "text/plain", md: "text/markdown",
  xml: "application/xml", svg: "image/svg+xml", webmanifest: "application/manifest+json", csv: "text/csv", map: "application/json",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", mp4: "video/mp4", webm: "video/webm", pdf: "application/pdf",
};
export const extOf = (p) => { const b = String(p).split("/").pop(); const i = b.lastIndexOf("."); return i <= 0 ? "" : b.slice(i + 1).toLowerCase(); };
export const isText = (p) => TEXT.has(extOf(p));
export const isAllowed = (p) => TEXT.has(extOf(p)) || BIN.has(extOf(p));
export const isImage = (p) => ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg"].includes(extOf(p));
export const mimeOf = (p) => MIME[extOf(p)] || "application/octet-stream";
export const baseName = (p) => p.split("/").pop();
export const dirName = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

// Same rules as the server: throws Error with a friendly message.
export function normalizePath(raw) {
  let p = String(raw == null ? "" : raw).replace(/\\/g, "/").trim().replace(/^(\.\/)+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!p) throw new Error("Name can't be empty.");
  if (p.length > LIMITS.maxPathLength) throw new Error("Path is too long.");
  const parts = p.split("/");
  if (parts.length > LIMITS.maxDepth) throw new Error("Folders are nested too deeply.");
  for (const s of parts) {
    if (!s || s === "." || s === "..") throw new Error("Unsafe path: " + p);
    if (s.startsWith(".")) throw new Error("Names can't start with a dot: " + p);
    if (/[\u0000-\u001f\u007f<>:"|?*\\]/.test(s)) throw new Error('Invalid characters in name (< > : " | ? * are not allowed).');
  }
  return parts.join("/");
}

export function bytesToBase64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBytes(b64) {
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
export const utf8Size = (s) => new TextEncoder().encode(s).length;
export const b64Size = (b) => Math.floor((b.length * 3) / 4) - (b.endsWith("==") ? 2 : b.endsWith("=") ? 1 : 0);
export const fmtBytes = (n) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB");
export const dataUri = (rec) => (rec.enc === "base64" ? `data:${mimeOf(rec.path)};base64,${rec.data}` : `data:${mimeOf(rec.path)};charset=utf-8,${encodeURIComponent(rec.data)}`);

// File -> record for upload {path, enc, data}
export async function readFileRecord(file, path) {
  if (isText(path)) return { path, enc: "utf8", data: await file.text() };
  const buf = new Uint8Array(await file.arrayBuffer());
  return { path, enc: "base64", data: bytesToBase64(buf) };
}
