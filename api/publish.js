const { db, verifyIdToken } = require("../lib/firebaseAdmin");
const { parsePath, pathToKey } = require("../lib/ids");

const MAX_SITES_PER_USER = 3;

// Resolve who's calling: either a logged-in browser (Firebase ID token) or
// an external developer using their API key. Exactly one of these must be
// present. `viaApi` is what decides whether ads get injected on the
// published page (see api/site.js) — sites made in the dashboard stay
// ad-free, sites published through the API carry ads.
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

module.exports = async (req, res) => {
  try {
    if (req.method === "POST") return await handlePublish(req, res);
    if (req.method === "DELETE") return await handleDelete(req, res);
    return res.status(405).json({ error: "POST or DELETE only" });
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ error: e.message || "Request failed." });
  }
};

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
  if (!body.html || !String(body.html).trim() || !body.title || !String(body.title).trim()) {
    return res.status(400).json({ error: "Title and HTML content are required." });
  }

  const key = pathToKey(parsed.path);
  const publicRef = db().ref(`sitesPublic/${key}`);
  const existing = (await publicRef.get()).val();

  const mode = body.mode === "update" ? "update" : "create";

  if (mode === "create") {
    if (existing) {
      return res.status(409).json({ error: "This address is already taken." });
    }
    const countSnap = await db().ref(`users/${uid}/sites`).get();
    const count = countSnap.exists() ? Object.keys(countSnap.val()).length : 0;
    if (count >= MAX_SITES_PER_USER) {
      return res.status(403).json({ error: `You can only have ${MAX_SITES_PER_USER} websites. Delete one first.` });
    }
  } else {
    if (!existing) return res.status(404).json({ error: "Website not found." });
    if (existing.ownerUid !== uid) return res.status(403).json({ error: "You don't own this website." });
  }

  const now = Date.now();
  const record = {
    title: String(body.title).slice(0, 150),
    description: String(body.description || "").slice(0, 300),
    html: String(body.html),
    css: String(body.css || ""),
    js: String(body.js || ""),
    path: parsed.path,
    ownerUid: uid,
    viaApi: mode === "create" ? viaApi : existing.viaApi, // flag is fixed at creation time
    createdAt: mode === "create" ? now : existing.createdAt,
    updatedAt: now,
  };

  await publicRef.set(record);
  await db().ref(`users/${uid}/sites/${key}`).set({
    path: parsed.path,
    title: record.title,
    updatedAt: now,
  });

  const DOMAIN = process.env.PUBLIC_DOMAIN || "https://webora-lovat.vercel.app";
  return res.status(200).json({ ok: true, path: parsed.path, url: `${DOMAIN}/${parsed.path}` });
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
  await db().ref(`users/${uid}/sites/${key}`).remove();
  return res.status(200).json({ ok: true });
}
