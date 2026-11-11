// Image hosting: POST uploads (auth required), GET /i/:id serves.
// Flow: browser -> this function (Vercel) -> Render (CloudNest, shorten=false)
// -> direct Catbox URL stored in our DB -> served back from OUR domain.
const crypto = require("crypto");
const { db, verifyIdToken } = require("../lib/firebaseAdmin");

const DOMAIN = process.env.PUBLIC_DOMAIN || "https://webora-lovat.vercel.app";
const RENDER = process.env.CLOUDNEST_URL || "https://droplink-a7b1.onrender.com";
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB per image (Vercel body limit is ~4.5 MB incl. base64)

const TYPES = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

function sniff(b) {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 6 && b.slice(0, 3).toString() === "GIF") return "gif";
  if (b.length > 12 && b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return "webp";
  return null;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, Authorization");
}

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
    if (req.method === "GET") return await serve(req, res);
    if (req.method === "POST") return await upload(req, res);
    return res.status(405).json({ error: "GET or POST only" });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error(e);
    return res.status(e.status || 500).json({ error: e.message || "Request failed." });
  }
};

async function upload(req, res) {
  const uid = await caller(req);
  const body = req.body || {};
  const apiKey = process.env.CLOUDNEST_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Image hosting is not configured."), { status: 500 });

  // JSON body: { name, data: "<base64 or data: URL>" }
  const b64 = String(body.data || "").replace(/^data:[^,]*,/, "");
  if (!b64) throw Object.assign(new Error("Send { name, data } where data is the base64 image."), { status: 400 });
  let buf = Buffer.from(b64, "base64");
  if (!buf.length) throw Object.assign(new Error("Empty image."), { status: 400 });
  if (buf.length > MAX_BYTES) throw Object.assign(new Error("Image is larger than 3 MB."), { status: 413 });
  const ext = sniff(buf);
  if (!ext) throw Object.assign(new Error("Only PNG, JPG, GIF or WEBP images are allowed."), { status: 415 });

  // Random trailer so re-uploading the same file never collides/fails upstream.
  // Decoders ignore bytes after the end-of-image marker.
  buf = Buffer.concat([buf, crypto.randomBytes(8)]);

  const id = crypto.randomBytes(8).toString("hex");
  const name = String(body.name || "image").replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60) || "image";

  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: TYPES[ext] }), `${id}.${ext}`);
  fd.append("shorten", "false");
  const r = await fetch(`${RENDER}/api/upload/file`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: fd,
    signal: AbortSignal.timeout(55000), // Render free tier can cold-start
  });
  const j = await r.json().catch(() => ({}));
  const src = j.direct_url || j.url;
  if (!r.ok || !src || !/^https:\/\/files\.catbox\.moe\//.test(src)) {
    throw Object.assign(new Error("Image storage is busy. Please try again in a moment."), { status: 502 });
  }

  await db().ref(`images/${id}`).set({ uid, name, ext, src, size: buf.length, createdAt: Date.now() });
  await db().ref(`users/${uid}/images/${id}`).set({ name, ext, createdAt: Date.now() });
  const url = `${DOMAIN}/i/${id}.${ext}`;
  return res.status(200).json({ ok: true, id, name, url, size: buf.length });
}

async function serve(req, res) {
  const id = String(req.query.id || "").replace(/\.[a-z0-9]+$/i, "");
  if (!/^[a-f0-9]{16}$/.test(id)) return res.status(404).send("Not found");
  const rec = (await db().ref(`images/${id}`).get()).val();
  if (!rec || !/^https:\/\/files\.catbox\.moe\//.test(rec.src)) return res.status(404).send("Not found");
  const up = await fetch(rec.src, { signal: AbortSignal.timeout(20000) });
  if (!up.ok) return res.status(502).send("Image unavailable");
  const out = Buffer.from(await up.arrayBuffer());
  res.setHeader("Content-Type", TYPES[rec.ext] || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");
  res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
  return res.status(200).send(out);
}
