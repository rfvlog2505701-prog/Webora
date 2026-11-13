
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

function noStore(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

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
:root{color-scheme:light;--ink:#17213b;--muted:#69748f;--blue:#4169ef}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;grid-template-rows:auto 1fr auto;padding:24px;font:15px/1.6 Inter,system-ui,sans-serif;color:var(--ink);background:radial-gradient(ellipse at 50% 15%,rgba(106,137,255,.13),transparent 42%),#f5f7ff}
header,footer{width:min(100%,960px);margin:auto;display:flex;align-items:center}
header{gap:10px;padding:4px 0}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:#26365f;font-weight:800;letter-spacing:-.4px}
.brand-mark{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;color:white;background:linear-gradient(145deg,#6d8cff,#3856d9);box-shadow:0 7px 18px #4169ef40}
.brand-mark svg{width:23px;height:23px}
main{width:min(100%,560px);margin:auto;display:grid;place-items:center;padding:48px 0}
.panel{width:100%;background:rgba(255,255,255,.94);border:1px solid #dce3f2;border-radius:28px;padding:clamp(28px,6vw,48px);text-align:center;box-shadow:0 24px 80px #20377017}
.icon-wrap{width:82px;height:82px;margin:0 auto 24px;border-radius:25px;display:grid;place-items:center;color:#d34c68;background:linear-gradient(145deg,#fff0f3,#ffe4e9);border:1px solid #ffd4dd}
.icon-wrap svg{width:38px;height:38px}
.eyebrow{display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;color:#b33e59;background:#fff1f4;border:1px solid #ffdae2;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase}
h1{margin:17px 0 10px;font-size:clamp(27px,6vw,36px);line-height:1.15;letter-spacing:-1.2px}
p{margin:0 auto;color:var(--muted);max-width:390px;font-size:15px}
.rule{height:1px;background:#e5eaf5;margin:27px 0 22px}
.hint{font-size:12px;color:#8892a8}
.actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:25px}
.btn{display:inline-flex;justify-content:center;align-items:center;min-height:44px;padding:0 19px;border-radius:12px;font-weight:700;font-size:13px;text-decoration:none;transition:transform .18s,box-shadow .18s}
.btn:hover{transform:translateY(-2px)}
.primary{color:#fff;background:linear-gradient(135deg,#557cff,#3858dc);box-shadow:0 8px 20px #4169ef40}
.secondary{color:#485777;background:#f5f7fc;border:1px solid #e4e9f3}
footer{justify-content:center;padding:20px 0 4px;color:#98a1b4;font-size:12px}
footer strong{color:#697794;margin:0 4px}
@media(max-width:480px){body{padding:18px}.panel{border-radius:23px}.actions{flex-direction:column}.btn{width:100%}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important}}
</style>
</head>
<body>
<header>
<a class="brand" href="/" aria-label="Webora home">
<span class="brand-mark"><svg viewBox="0 0 32 24" fill="none" aria-hidden="true"><path d="M2 4.5 8.2 20 15.9 6.5 23.7 20 30 4.5" stroke="currentColor" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
<span>Webora</span>
</a>
</header>
<main>
<section class="panel" role="status" aria-live="polite">
<div class="icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/></svg></div>
<span class="eyebrow">● File unavailable</span>
<h1>This file was deleted</h1>
<p>The image you're trying to view has been deleted by its owner. This link is no longer active.</p>
<div class="rule"></div>
<div class="hint">HTTP 410 · Gone</div>
<div class="actions">
<a class="btn primary" href="/">Go to Webora</a>
<a class="btn secondary" href="javascript:history.back()">Go back</a>
</div>
</section>
</main>
<footer>Hosted with <strong>Webora</strong></footer>
</body>
</html>`;
}

async function caller(req) {
  const key = req.headers["x-api-key"];
  if (key) {
    const rec = (await db().ref(\`apiKeys/\${String(key).replace(/[.#$\\[\\]\\/]/g, "")}\`).get()).val();
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

  const b64 = String(body.data || "").replace(/^data:[^,]*,/, "");
  if (!b64) throw Object.assign(new Error("Send { name, data } where data is the base64 image."), { status: 400 });

  let buf = Buffer.from(b64, "base64");
  if (!buf.length) throw Object.assign(new Error("Empty image."), { status: 400 });
  if (buf.length > MAX_BYTES) throw Object.assign(new Error("Image is larger than 3 MB."), { status: 413 });

  const ext = sniff(buf);
  if (!ext) throw Object.assign(new Error("Only PNG, JPG, GIF or WEBP images are allowed."), { status: 415 });

  buf = Buffer.concat([buf, crypto.randomBytes(8)]);

  const id = crypto.randomBytes(8).toString("hex");
  const name = String(body.name || "image").replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60) || "image";

  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: TYPES[ext] }), \`\${id}.\${ext}\`);
  fd.append("shorten", "false");

  const r = await fetch(\`\${CLOUDNEST_URL}/api/upload/file?shorten=false\`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: fd,
    signal: AbortSignal.timeout(55000)
  });

  const j = await r.json().catch(() => ({}));
  const src = (j && (j.direct_url || j.url)) || "";

  if (!r.ok || !j.success || !SRC_OK.test(src)) {
    throw Object.assign(new Error("Image storage is busy. Please try again in a moment."), { status: 502 });
  }

  const url = \`\${DOMAIN}/img/\${id}.\${ext}\`;
  const createdAt = Date.now();

  await db().ref(\`images/\${id}\`).set({
    uid, name, ext, src, size: buf.length, createdAt, deleted: false
  });

  await db().ref(\`users/\${uid}/images/\${id}\`).set({
    name, ext, size: buf.length, url, createdAt, deleted: false
  });

  return res.status(200).json({ ok: true, id, name, url, size: buf.length });
}

async function serve(req, res) {
  noStore(res);

  const id = String(req.query.id || "").replace(/\.[a-z0-9]+$/i, "");

  if (!/^[a-f0-9]{16}$/.test(id)) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(404).send("Not found");
  }

  const rec = (await db().ref(\`images/\${id}\`).get()).val();

  if (!rec) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(404).send("Not found");
  }

  if (rec.deleted) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(410).send(deletedPage());
  }

  if (!SRC_OK.test(rec.src)) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(404).send("Not found");
  }

  const up = await fetch(rec.src, { signal: AbortSignal.timeout(20000) });

  if (!up.ok) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(502).send("Image unavailable");
  }

  const out = Buffer.from(await up.arrayBuffer());

  res.setHeader("Content-Type", TYPES[rec.ext] || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");

  return res.status(200).send(out);
}

async function list(req, res) {
  const uid = await caller(req);
  const snap = (await db().ref(\`users/\${uid}/images\`).get()).val() || {};

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

async function remove(req, res) {
  const uid = await caller(req);
  const id = String((req.body && req.body.id) || "").trim();

  if (!/^[a-f0-9]{16}$/.test(id)) {
    throw Object.assign(new Error("Invalid image id."), { status: 400 });
  }

  const rec = (await db().ref(\`images/\${id}\`).get()).val();

  if (!rec) throw Object.assign(new Error("Image not found."), { status: 404 });
  if (rec.uid !== uid) throw Object.assign(new Error("You don't own this image."), { status: 403 });

  await db().ref(\`images/\${id}\`).update({
    deleted: true,
    deletedAt: Date.now()
  });

  await db().ref(\`users/\${uid}/images/\${id}\`).update({
    deleted: true
  });

  return res.status(200).json({ ok: true, id });
    }
    
