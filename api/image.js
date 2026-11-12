// Image hosting: POST uploads (auth required), GET /img/:id serves,
// GET ?action=list returns the caller's own upload history, DELETE removes one.
// Flow: browser -> this function (Vercel) -> upload backend at WEBORA_IMG_URL
// (shorten=false, key in WEBORA_IMG_API) -> direct storage URL (ImgBB for
// images up to 32 MB) stored in our DB -> served back from OUR domain, so
// nobody looking at the link can tell it's hosted anywhere else.
const crypto = require("crypto");
const { db, verifyIdToken } = require("../lib/firebaseAdmin");

const DOMAIN = process.env.PUBLIC_DOMAIN || "https://webora-lovat.vercel.app";
const CLOUDNEST_URL = process.env.WEBORA_IMG_URL || "https://droplink-a7b1.onrender.com";
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB per image (Vercel body limit is ~4.5 MB incl. base64)

const TYPES = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
// Known storage hosts CloudNest hands back direct links from — serve() only
// ever fetches from one of these, so an upstream can't be tricked into
// making our server fetch an arbitrary URL.
const SRC_OK = /^https:\/\/(i\.ibb\.co|files\.catbox\.moe|litterbox\.catbox\.moe)\//;

function sniff(b) {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 6 && b.slice(0, 3).toString() === "GIF") return "gif";
  if (b.length > 12 && b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return "webp";
  return null;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, Authorization");
}

// Identifies the caller and returns their uid — same rule for every verb:
// either a per-user API key (Developer API) or a logged-in session token.
async function caller(req) {
  const key = req.headers["x-api-key"];
  if (key) {
    const rec = (await db().ref(`apiKeys/${String(key).replace(/[.#$\[\]\/]/g, "")}`).get()).val();
    if (!rec) throw Object.assign(new Error("Invalid API key."), { status: 401 });
    return rec.uid;
  }
  return (await verifyIdToken(req)).uid;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    if (req.method === "GET" && String(req.query.action || "") === "list") return await list(req, res);
    if (req.method === "GET") return await serve(req, res);
    if (req.method === "POST") return await upload(req, res);
    if (req.method === "DELETE") return await remove(req, res);
    return res.status(405).json({ error: "GET, POST or DELETE only" });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error(e);
    return res.status(e.status || 500).json({ error: e.message || "Request failed." });
  }
};

async function upload(req, res) {
  const uid = await caller(req);
  const body = req.body || {};
  const apiKey = process.env.WEBORA_IMG_API;
  if (!apiKey) throw Object.assign(new Error("Image hosting is not configured."), { status: 500 });

  // JSON body: { name, data: "<base64 or data: URL>" }
  const b64 = String(body.data || "").replace(/^data:[^,]*,/, "");
  if (!b64) throw Object.assign(new Error("Send { name, data } where data is the base64 image."), { status: 400 });
  let buf = Buffer.from(b64, "base64");
  if (!buf.length) throw Object.assign(new Error("Empty image."), { status: 400 });
  if (buf.length > MAX_BYTES) throw Object.assign(new Error("Image is larger than 3 MB."), { status: 413 });
  const ext = sniff(buf);
  if (!ext) throw Object.assign(new Error("Only PNG, JPG, GIF or WEBP images are allowed."), { status: 415 });

  // Random trailer so re-uploading the exact same file never collides/fails
  // upstream. Decoders ignore bytes after the end-of-image marker.
  buf = Buffer.concat([buf, crypto.randomBytes(8)]);

  const id = crypto.randomBytes(8).toString("hex"); // the random token in our own /img/<token> link
  const name = String(body.name || "image").replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60) || "image";

  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: TYPES[ext] }), `${id}.${ext}`);
  fd.append("shorten", "false"); // we want the direct storage link, not a CloudNest short link
  const r = await fetch(`${CLOUDNEST_URL}/api/upload/file?shorten=false`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: fd,
    signal: AbortSignal.timeout(55000), // free tier can cold-start
  });
  const j = await r.json().catch(() => ({}));
  const src = (j && (j.direct_url || j.url)) || "";
  if (!r.ok || !j.success || !SRC_OK.test(src)) {
    throw Object.assign(new Error("Image storage is busy. Please try again in a moment."), { status: 502 });
  }

  const url = `${DOMAIN}/img/${id}.${ext}`;
  const createdAt = Date.now();
  await db().ref(`images/${id}`).set({ uid, name, ext, src, size: buf.length, createdAt, deleted: false });
  await db().ref(`users/${uid}/images/${id}`).set({ name, ext, size: buf.length, url, createdAt, deleted: false });
  return res.status(200).json({ ok: true, id, name, url, size: buf.length });
}

// GET /img/:id (public, no auth) — fetches the real image from storage and
// serves it back from our own domain, so the real host is never exposed.
async function serve(req, res) {
  const id = String(req.query.id || "").replace(/\.[a-z0-9]+$/i, "");
  if (!/^[a-f0-9]{16}$/.test(id)) return res.status(404).send("Not found");
  const rec = (await db().ref(`images/${id}`).get()).val();
  if (!rec) return res.status(404).send("Not found");
  if (rec.deleted) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(410).send(`<!doctype html><title>Image removed</title><body style="font:15px/1.5 system-ui,sans-serif;padding:60px 20px;text-align:center;color:#55607a">File was deleted.</body>`);
  }
  if (!SRC_OK.test(rec.src)) return res.status(404).send("Not found");
  const up = await fetch(rec.src, { signal: AbortSignal.timeout(20000) });
  if (!up.ok) return res.status(502).send("Image unavailable");
  const out = Buffer.from(await up.arrayBuffer());
  res.setHeader("Content-Type", TYPES[rec.ext] || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");
  res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
  return res.status(200).send(out);
}

// GET /api/image?action=list (auth required) — the caller's own upload history.
async function list(req, res) {
  const uid = await caller(req);
  const snap = (await db().ref(`users/${uid}/images`).get()).val() || {};
  const images = Object.entries(snap)
    .map(([id, rec]) => ({ id, name: rec.name, ext: rec.ext, size: rec.size || 0, url: rec.url, createdAt: rec.createdAt, deleted: !!rec.deleted }))
    .sort((a, b) => b.createdAt - a.createdAt);
  return res.status(200).json({ ok: true, images });
}

// DELETE /api/image  { id }  (auth required, must own the image) — soft-deletes:
// the link stays alive and shows "File was deleted" instead of just vanishing.
async function remove(req, res) {
  const uid = await caller(req);
  const id = String((req.body && req.body.id) || "").trim();
  if (!/^[a-f0-9]{16}$/.test(id)) throw Object.assign(new Error("Invalid image id."), { status: 400 });
  const rec = (await db().ref(`images/${id}`).get()).val();
  if (!rec) throw Object.assign(new Error("Image not found."), { status: 404 });
  if (rec.uid !== uid) throw Object.assign(new Error("You don't own this image."), { status: 403 });
  await db().ref(`images/${id}`).update({ deleted: true, deletedAt: Date.now() });
  await db().ref(`users/${uid}/images/${id}`).update({ deleted: true });
  return res.status(200).json({ ok: true, id });
}
