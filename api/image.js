
// Image hosting: POST uploads (auth required), GET /img/:id serves,
// GET ?action=list returns the caller's own upload history, DELETE removes one.
const crypto = require("crypto");
const { db, verifyIdToken } = require("../lib/firebaseAdmin");

const DOMAIN = process.env.PUBLIC_DOMAIN || "https://webora-lovat.vercel.app";
const CLOUDNEST_URL = process.env.WEBORA_IMG_URL || "https://droplink-a7b1.onrender.com";
const MAX_BYTES = 3 * 1024 * 1024;

const TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp"
};

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

// Prevent browser and CDN caching of image responses.
function noStore(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

// Webora deleted-file page.
function deletedPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f5f7ff">
<meta name="robots" content="noindex,nofollow">
<title>This file was deleted — Webora</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;padding:24px;display:grid;place-items:center;background:#f4f6ff;color:#17213b;font:15px/1.6 Inter,system-ui,-apple-system,Segoe UI,sans-serif}
main{width:min(100%,540px);padding:clamp(28px,6vw,48px);text-align:center;background:#fff;border:1px solid #e0e6f4;border-radius:26px;box-shadow:0 24px 70px rgba(32,55,112,.10)}
.logo{width:54px;height:54px;margin:0 auto 22px;display:grid;place-items:center;border-radius:17px;background:linear-gradient(145deg,#8063ff,#4523d5);color:#fff;font-size:30px;font-weight:900;box-shadow:0 9px 24px #6245e533}
.tag{display:inline-block;padding:6px 12px;border-radius:99px;background:#fff0f3;color:#b33e59;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase}
h1{margin:18px 0 10px;font-size:clamp(27px,6vw,36px);line-height:1.15;letter-spacing:-1px}
p{margin:0 auto;color:#69748f;max-width:390px}
.line{height:1px;background:#e8ecf5;margin:25px 0 17px}
.code{font-size:12px;color:#8b95aa}
a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin-top:24px;padding:0 20px;border-radius:12px;background:linear-gradient(135deg,#6746ef,#4824d5);color:white;text-decoration:none;font-weight:700}
footer{margin-top:22px;color:#929bb0;font-size:12px}
</style>
</head>
<body>
<main>
<div class="logo">W</div>
<span class="tag">File unavailable</span>
<h1>This file was deleted</h1>
<p>The image you're trying to view has been deleted by its owner. This link is no longer active.</p>
<div class="line"></div>
<div class="code">HTTP 410 · Gone</div>
<a href="/">Go to Webora</a>
<footer>Hosted with Webora</footer>
</main>
</body>
</html>`;
}

// Authentication: API key or logged-in session.
async function caller(req) {
  const key = req.headers["x-api-key"];

  if (key) {
    const rec = (await db().ref(`apiKeys/${String(key).replace(/[.#$\[\]\/]/g, "")}`).get()).val();

    if (!rec) {
      throw Object.assign(new Error("Invalid API key."), { status: 401 });
    }

    return rec.uid;
  }

  return (await verifyIdToken(req)).uid;
}

module.exports = async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    if (req.method === "GET" && String(req.query.action || "") === "list") {
      return await list(req, res);
    }

    if (req.method === "GET") return await serve(req, res);
    if (req.method === "POST") return await upload(req, res);
    if (req.method === "DELETE") return await remove(req, res);

    return res.status(405).json({ error: "GET, POST or DELETE only" });

  } catch (e) {
    if (!e.status || e.status >= 500) console.error(e);
    return res.status(e.status || 500).json({
      error: e.message || "Request failed."
    });
  }
};

// ORIGINAL UPLOAD LOGIC — PRESERVED.
async function upload(req, res) {
  const uid = await caller(req);
  const body = req.body || {};
  const apiKey = process.env.WEBORA_IMG_API;

  if (!apiKey) {
    throw Object.assign(new Error("Image hosting is not configured."), { status: 500 });
  }

  const b64 = String(body.data || "").replace(/^data:[^,]*,/, "");

  if (!b64) {
    throw Object.assign(new Error("Send { name, data } where data is the base64 image."), { status: 400 });
  }

  let buf = Buffer.from(b64, "base64");

  if (!buf.length) {
    throw Object.assign(new Error("Empty image."), { status: 400 });
  }

  if (buf.length > MAX_BYTES) {
    throw Object.assign(new Error("Image is larger than 3 MB."), { status: 413 });
  }

  const ext = sniff(buf);

  if (!ext) {
    throw Object.assign(new Error("Only PNG, JPG, GIF or WEBP images are allowed."), { status: 415 });
  }

  // Random trailer prevents duplicate upload collisions.
  buf = Buffer.concat([buf, crypto.randomBytes(8)]);

  const id = crypto.randomBytes(8).toString("hex");

  const name = String(body.name || "image")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .slice(0, 60) || "image";

  const fd = new FormData();

  fd.append("file", new Blob([buf], { type: TYPES[ext] }), `${id}.${ext}`);
  fd.append("shorten", "false");

  const r = await fetch(`${CLOUDNEST_URL}/api/upload/file?shorten=false`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: fd,
    signal: AbortSignal.timeout(55000)
  });

  const j = await r.json().catch(() => ({}));
  const src = (j && (j.direct_url || j.url)) || "";

  if (!r.ok || !j.success || !SRC_OK.test(src)) {
    throw Object.assign(
      new Error("Image storage is busy. Please try again in a moment."),
      { status: 502 }
    );
  }

  const url = `${DOMAIN}/img/${id}.${ext}`;
  const createdAt = Date.now();

  await db().ref(`images/${id}`).set({
    uid,
    name,
    ext,
    src,
    size: buf.length,
    createdAt,
    deleted: false
  });

  await db().ref(`users/${uid}/images/${id}`).set({
    name,
    ext,
    size: buf.length,
    url,
    createdAt,
    deleted: false
  });

  return res.status(200).json({
    ok: true,
    id,
    name,
    url,
    size: buf.length
  });
}

// GET /img/:id
async function serve(req, res) {
  noStore(res);

  const id = String(req.query.id || "").replace(/\.[a-z0-9]+$/i, "");

  if (!/^[a-f0-9]{16}$/.test(id)) {
    return res.status(404).send("Not found");
  }

  const rec = (await db().ref(`images/${id}`).get()).val();

  if (!rec) {
    return res.status(404).send("Not found");
  }

  if (rec.deleted) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("X-Content-Type-Options", "nosniff");

    return res.status(410).send(deletedPage());
  }

  if (!SRC_OK.test(rec.src)) {
    return res.status(404).send("Not found");
  }

  const up = await fetch(rec.src, {
    signal: AbortSignal.timeout(20000)
  });

  if (!up.ok) {
    return res.status(502).send("Image unavailable");
  }

  const out = Buffer.from(await up.arrayBuffer());

  res.setHeader("Content-Type", TYPES[rec.ext] || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");

  return res.status(200).send(out);
}

// GET /api/image?action=list
async function list(req, res) {
  const uid = await caller(req);

  const snap = (await db().ref(`users/${uid}/images`).get()).val() || {};

  const images = Object.entries(snap)
    .map(([id, rec]) => ({
      id,
      name: rec.name,
      ext: rec.ext,
      size: rec.size || 0,
      url: rec.url,
      createdAt: rec.createdAt,
      deleted: !!rec.deleted
    }))
    .sort((a, b) => b.createdAt - a.createdAt);

  return res.status(200).json({ ok: true, images });
}

// DELETE /api/image
async function remove(req, res) {
  const uid = await caller(req);
  const id = String((req.body && req.body.id) || "").trim();

  if (!/^[a-f0-9]{16}$/.test(id)) {
    throw Object.assign(new Error("Invalid image id."), { status: 400 });
  }

  const rec = (await db().ref(`images/${id}`).get()).val();

  if (!rec) {
    throw Object.assign(new Error("Image not found."), { status: 404 });
  }

  if (rec.uid !== uid) {
    throw Object.assign(new Error("You don't own this image."), { status: 403 });
  }

  await db().ref(`images/${id}`).update({
    deleted: true,
    deletedAt: Date.now()
  });

  await db().ref(`users/${uid}/images/${id}`).update({
    deleted: true
  });

  return res.status(200).json({ ok: true, id });
}
