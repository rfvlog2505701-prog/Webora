// Safe ZIP import / export (JSZip loaded on demand from cdnjs).
import { LIMITS, normalizePath, isAllowed, isText, bytesToBase64, utf8Size } from "/assets/fileutil.js";

let jszip;
export function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return (jszip ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = () => res(window.JSZip);
    s.onerror = () => { jszip = null; rej(new Error("Couldn't load the ZIP library. Check your connection and try again.")); };
    document.head.appendChild(s);
  }));
}

const JUNK = (p) => /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i.test(p) || p.split("/").some((s) => s.startsWith("."));

// Reads + validates an archive. Never trusts headers: sizes are re-checked on the real bytes.
// Throws on anything malicious (path traversal, zip bombs, absurd sizes). Returns files + skipped.
export async function readZip(file, onProgress = () => {}) {
  if (!/\.zip$/i.test(file.name)) throw new Error("Please choose a .zip file.");
  if (file.size > LIMITS.maxZipBytes) throw new Error(`ZIP is too large (max ${LIMITS.maxZipBytes / 1048576} MB).`);
  const JSZip = await loadJSZip();
  let zip;
  try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error("This ZIP file is corrupt or unreadable."); }
  const all = Object.values(zip.files);
  if (all.length > LIMITS.maxZipEntries) throw new Error(`ZIP contains too many entries (max ${LIMITS.maxZipEntries}).`);

  // 1) security scan of every path BEFORE extracting anything
  for (const e of all) {
    const n = e.name.replace(/\\/g, "/");
    if (n.startsWith("/") || /^[a-z]:/i.test(n) || n.split("/").includes("..")) throw new Error(`Unsafe path in ZIP rejected: "${e.name}"`);
  }
  const entries = all.filter((e) => !e.dir && !JUNK(e.name.replace(/\\/g, "/")));

  // 2) detect project root = folder of the shallowest index.html
  const idx = entries.map((e) => e.name.replace(/\\/g, "/")).filter((n) => /(^|\/)index\.html$/i.test(n)).sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (!idx) throw new Error("No index.html found in this ZIP. A website project needs an index.html.");
  const prefix = idx.slice(0, idx.length - "index.html".length);

  const skipped = [];
  const files = [];
  let total = 0;
  const inRoot = entries.filter((e) => { const n = e.name.replace(/\\/g, "/"); if (!n.startsWith(prefix)) { skipped.push({ path: n, reason: "outside project root" }); return false; } return true; });
  let done = 0;
  for (const e of inRoot) {
    const full = e.name.replace(/\\/g, "/");
    let path;
    try { path = normalizePath(full.slice(prefix.length)); } catch (err) { skipped.push({ path: full, reason: err.message }); continue; }
    if (!isAllowed(path)) { skipped.push({ path, reason: "file type not allowed" }); continue; }
    const d = e._data || {};
    if (d.uncompressedSize > LIMITS.maxFileBytes) { skipped.push({ path, reason: "file too large" }); continue; }
    if (d.compressedSize > 0 && d.uncompressedSize / d.compressedSize > 300 && d.uncompressedSize > 1048576) { skipped.push({ path, reason: "suspicious compression ratio" }); continue; }
    if (files.length >= LIMITS.maxFiles) throw new Error(`Too many files (max ${LIMITS.maxFiles}).`);
    let rec;
    if (isText(path)) {
      const text = await e.async("string");
      const size = utf8Size(text);
      if (size > LIMITS.maxFileBytes) { skipped.push({ path, reason: "file too large" }); continue; }
      total += size; rec = { path, enc: "utf8", data: text, size };
    } else {
      const u8 = await e.async("uint8array");
      if (u8.length > LIMITS.maxFileBytes) { skipped.push({ path, reason: "file too large" }); continue; }
      total += u8.length; rec = { path, enc: "base64", data: bytesToBase64(u8), size: u8.length };
    }
    if (total > LIMITS.maxTotalBytes) throw new Error(`Extracted size is over the ${LIMITS.maxTotalBytes / 1048576} MB project limit.`);
    files.push(rec);
    onProgress(++done / inRoot.length);
  }
  if (!files.some((f) => f.path === "index.html")) throw new Error("index.html could not be extracted.");
  return { files, skipped, root: prefix || "/", total };
}

export async function exportZip(files, name = "website") {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  for (const f of files) {
    if (f.dir) zip.folder(f.path);
    else if (f.enc === "base64") zip.file(f.path, f.data, { base64: true });
    else zip.file(f.path, f.data);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "website") + ".zip";
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

// Uploads records to a project in size-limited batches. Returns when all are stored.
export async function uploadBatches(api, pid, records, onProgress = () => {}, base = {}) {
  let batch = [], bytes = 0, sent = 0;
  const flush = async () => {
    if (!batch.length) return;
    await api("save", { pid, files: batch });
    sent += batch.length; onProgress(sent / records.length);
    batch = []; bytes = 0;
  };
  for (const r of records) {
    const sz = r.data.length;
    if (batch.length && (bytes + sz > LIMITS.requestBytes || batch.length >= 60)) await flush();
    batch.push({ path: r.path, content: r.data, enc: r.enc, baseV: (base[r.path] || 0) });
    bytes += sz;
  }
  await flush();
}
