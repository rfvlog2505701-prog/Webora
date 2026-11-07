const { db, verifyIdToken } = require("../lib/firebaseAdmin");
const { parsePath, pathToKey } = require("../lib/ids");
const P = require("../lib/projects");
const { LIMITS, httpError, normalizePath, fileKey, buildFileRecord, isAllowedPath } = P;

// Resolve who's calling: either a logged-in browser (Firebase ID token) or
// an external developer using their API key. Exactly one of these must be
// present.
async function resolveCaller(req) {
  const apiKey =
    req.headers["x-api-key"] || (req.body && req.body.apiKey) || null;

  if (apiKey) {
    const record = (await db().ref(`apiKeys/${apiKey}`).get()).val();
    if (!record) {
      const err = new Error("Invalid API key.");
      err.status = 401;
      throw err;
    }
    return { uid: record.uid, viaApi: true };
  }

  const decoded = await verifyIdToken(req); // throws 401 on failure
  return { uid: decoded.uid, viaApi: false };
}

// CORS: lets browser-based tools / other websites call this API.
// Auth is still required (X-Api-Key or Bearer token), so this is safe.
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    if (req.method === "POST") return await handlePublish(req, res);
    if (req.method === "DELETE") return await handleDelete(req, res);
    return res.status(405).json({ error: "POST or DELETE only" });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error(e);
    return res.status(e.status || 500).json({ error: e.message || "Request failed." });
  }
};

// Builds the sitesFiles/{key} record set from a hybrid `files` array
// ([{path, content, enc}, ...] — folders allowed via path, e.g. "api/data.js",
// "css/style.css"). Mirrors the validation Studio's own save path uses.
function buildMultiFiles(list) {
  if (!Array.isArray(list) || !list.length) {
    throw httpError(400, "`files` must be a non-empty array of {path, content} objects.");
  }
  if (list.length > LIMITS.maxFiles) throw httpError(413, `Too many files (max ${LIMITS.maxFiles}).`);
  const out = {};
  let total = 0;
  let hasIndex = false;
  for (const f of list) {
    if (!f || typeof f.path !== "string") throw httpError(400, "Each file needs a `path`.");
    const rec = buildFileRecord(f); // throws 400/413 on anything unsafe or too big
    if (rec.path === "index.html") hasIndex = true;
    total += rec.size;
    out[fileKey(rec.path)] = { path: rec.path, enc: rec.enc, data: rec.data, size: rec.size };
  }
  if (!hasIndex) throw httpError(400, "Your project needs an index.html file at its root.");
  if (total > LIMITS.maxTotalBytes) throw httpError(413, `Project is larger than ${(LIMITS.maxTotalBytes / 1048576).toFixed(0)} MB.`);
  return out;
}

async function handlePublish(req, res) {
  const { uid, viaApi } = await resolveCaller(req);
  const body = req.body || {};

  const parsed = parsePath(body.path || body.username);
  if (!parsed.ok) {
    return res.status(400).json({
      error:
        "Invalid address. Use lowercase letters, numbers and hyphens, optionally followed by .webora.app, .webora.online or .webora.site",
    });
  }

  // Two publish shapes:
  //  1) legacy single-file: { html, css, js }
  //  2) hybrid multi-file:  { files: [{path, content, enc}, ...] } — supports
  //     folders (css/, js/, api/, etc.), exactly like a Studio project.
  const isMulti = Array.isArray(body.files) && body.files.length > 0;
  let multiFiles = null;
  if (isMulti) {
    multiFiles = buildMultiFiles(body.files);
  } else {
    if (!body.html || !String(body.html).trim() || !body.title || !String(body.title).trim()) {
      return res.status(400).json({ error: "Title and HTML content are required (or send a `files` array for a multi-file/hybrid site)." });
    }
  }
  if (!body.title || !String(body.title).trim()) {
    return res.status(400).json({ error: "Title is required." });
  }

  const key = pathToKey(parsed.path);
  const publicRef = db().ref(`sitesPublic/${key}`);
  const existing = (await publicRef.get()).val();

  const mode = body.mode === "update" ? "update" : "create";

  if (mode === "create") {
    if (existing) {
      return res.status(409).json({ error: "This address is already taken." });
    }
    // No limit on the number of websites an account can publish.
  } else {
    if (!existing) return res.status(404).json({ error: "Website not found." });
    if (existing.ownerUid !== uid) return res.status(403).json({ error: "You don't own this website." });
    if (existing.multi && !isMulti) {
      return res.status(409).json({ error: "This website is a multi-file project. Send a `files` array, or edit and publish it from Webora Studio (dashboard → Studio)." });
    }
  }

  const now = Date.now();

  if (isMulti) {
    await db().ref(`sitesFiles/${key}`).set(multiFiles);
  } else if (mode === "update" && existing && existing.multi) {
    // switching an existing multi-file site back to single-file via legacy fields
    await db().ref(`sitesFiles/${key}`).remove();
  }

  const indexRec = isMulti ? Object.values(multiFiles).find((r) => r.path === "index.html") : null;

  const record = {
    title: String(body.title).slice(0, 150),
    description: String(body.description || "").slice(0, 300),
    html: isMulti ? indexRec.data : String(body.html), // kept for sitemap/legacy readers
    css: isMulti ? "" : String(body.css || ""),
    js: isMulti ? "" : String(body.js || ""),
    path: parsed.path,
    ownerUid: uid,
    viaApi: mode === "create" ? viaApi : existing.viaApi,
    multi: isMulti,
    createdAt: mode === "create" ? now : existing.createdAt,
    updatedAt: now,
  };

  await publicRef.set(record);
  await db().ref(`users/${uid}/sites/${key}`).update({
    path: parsed.path,
    title: record.title,
    updatedAt: now,
  });

  const DOMAIN = process.env.PUBLIC_DOMAIN || "https://webora-lovat.vercel.app";
  return res.status(200).json({ ok: true, path: parsed.path, url: `${DOMAIN}/${parsed.path}`, multi: isMulti });
}

async function handleDelete(req, res) {
  const { uid } = await resolveCaller(req);
  const parsed = parsePath((req.body && (req.body.path || req.body.username)) || req.query.path);
  if (!parsed.ok) return res.status(400).json({ error: "Invalid address." });

  const key = pathToKey(parsed.path);
  const existing = (await db().ref(`sitesPublic/${key}`).get()).val();
  if (!existing) return res.status(404).json({ error: "Website not found." });
  if (existing.ownerUid !== uid) return res.status(403).json({ error: "You don't own this website." });

  await db().ref(`sitesPublic/${key}`).remove();
  await db().ref(`sitesFiles/${key}`).remove();
  await db().ref(`analytics/${key}`).remove();
  const linked = (await db().ref(`users/${uid}/sites/${key}/projectId`).get()).val() || existing.projectId;
  if (linked && /^[a-f0-9]{16}$/.test(linked)) {
    await db().ref(`projects/${uid}/${linked}`).update({ siteKey: null, sitePath: null, publishedAt: null, publishedVersion: null, liveVid: null });
  }
  await db().ref(`users/${uid}/sites/${key}`).remove();
  return res.status(200).json({ ok: true });
}
