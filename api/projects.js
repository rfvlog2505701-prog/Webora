// Multi-file project manager API (drafts, files, versions, publishing).
// One endpoint, many actions, so the whole feature fits in a single Vercel
// function:  POST /api/projects  { action: "...", ... }  + Bearer ID token.
//
// RTDB layout (all server-side only — the Admin SDK bypasses rules, so you
// can keep these nodes locked down for browsers):
//   projects/{uid}/{pid}                       project meta
//   projectFiles/{uid}/{pid}/{fileKey}         DRAFT files
//   projectVersions/{uid}/{pid}/{vid}          snapshot meta
//   projectVersionFiles/{uid}/{pid}/{vid}/...  snapshot files
//   sitesPublic/{siteKey}                      (existing) live site record
//   sitesFiles/{siteKey}/{fileKey}             PUBLISHED files of a multi-file site

const crypto = require("crypto");
const { db, verifyIdToken } = require("../lib/firebaseAdmin");
const { parsePath, pathToKey } = require("../lib/ids");
const P = require("../lib/projects");

const { LIMITS, httpError, normalizePath, fileKey, buildFileRecord, sanitizeName, isTextPath } = P;
// No cap on the number of websites an account can publish (per owner's request).
const now = () => Date.now();
const newId = () => crypto.randomBytes(8).toString("hex");
const vidOf = (n) => String(n).padStart(5, "0");

const mp = (uid, pid) => `projects/${uid}/${pid}`;
const dp = (uid, pid) => `projectFiles/${uid}/${pid}`;
const vp = (uid, pid, vid) => `projectVersions/${uid}/${pid}${vid ? "/" + vid : ""}`;
const vfp = (uid, pid, vid) => `projectVersionFiles/${uid}/${pid}/${vid}`;

function reqPid(b) {
  const pid = String(b.pid || "");
  if (!/^[a-f0-9]{16}$/.test(pid)) throw httpError(400, "Invalid project id.");
  return pid;
}
async function getMeta(uid, pid) {
  const meta = (await db().ref(mp(uid, pid)).get()).val();
  if (!meta) throw httpError(404, "Project not found.");
  return meta;
}
const getDraft = async (uid, pid) => (await db().ref(dp(uid, pid)).get()).val() || {};
function stats(map) {
  let fileCount = 0, totalBytes = 0;
  for (const r of Object.values(map)) if (r && !r.dir) { fileCount++; totalBytes += r.size || 0; }
  return { fileCount, totalBytes };
}
const publicMeta = (pid, m) => ({
  pid, name: m.name, createdAt: m.createdAt, updatedAt: m.updatedAt, rev: m.rev || 0,
  siteKey: m.siteKey || null, sitePath: m.sitePath || null,
  publishedAt: m.publishedAt || null, publishedVersion: m.publishedVersion || null,
  liveVid: m.liveVid || null, fileCount: m.fileCount || 0, totalBytes: m.totalBytes || 0,
  hasUnpublished: !!m.siteKey && (m.updatedAt || 0) > (m.publishedAt || 0),
});
const clientFile = (r) => ({ path: r.path, dir: !!r.dir, enc: r.enc || "utf8", data: r.data || "", size: r.size || 0, v: r.v || 1 });

// Validates a batch of incoming files and returns records (no DB access).
function checkBatchLimits(map) {
  const { fileCount, totalBytes } = stats(map);
  if (fileCount > LIMITS.maxFiles) throw httpError(413, `Too many files (max ${LIMITS.maxFiles}).`);
  if (totalBytes > LIMITS.maxTotalBytes) {
    throw httpError(413, `Project is larger than ${(LIMITS.maxTotalBytes / 1048576).toFixed(0)} MB.`);
  }
}

// ---------------------------------------------------------------- versions
async function createVersion(uid, pid, meta, draft, { kind, label }) {
  const n = meta.nextVersion || 1;
  const vid = vidOf(n);
  const s = stats(draft);
  if (Object.keys(draft).length) await db().ref(vfp(uid, pid, vid)).set(draft);
  const rec = { n, kind, label: String(label || "").slice(0, 80), createdAt: now(), fileCount: s.fileCount, totalBytes: s.totalBytes };
  await db().ref(vp(uid, pid, vid)).set(rec);
  meta.nextVersion = n + 1;
  await db().ref(mp(uid, pid)).update({ nextVersion: n + 1 });
  await pruneVersions(uid, pid, meta);
  return { vid, ...rec };
}
async function pruneVersions(uid, pid, meta) {
  const all = (await db().ref(vp(uid, pid)).get()).val() || {};
  const ids = Object.keys(all).sort();
  const extra = ids.length - LIMITS.maxVersions;
  if (extra <= 0) return;
  let removed = 0;
  for (const vid of ids) {
    if (removed >= extra) break;
    if (vid === meta.liveVid) continue; // never prune what is live
    await db().ref(vfp(uid, pid, vid)).remove();
    await db().ref(vp(uid, pid, vid)).remove();
    removed++;
  }
}

// ----------------------------------------------------------------- actions
const ACTIONS = {};

ACTIONS.list = async (uid) => {
  const all = (await db().ref(`projects/${uid}`).get()).val() || {};
  const projects = Object.entries(all).map(([pid, m]) => publicMeta(pid, m)).sort((a, b) => b.updatedAt - a.updatedAt);
  return { projects };
};

ACTIONS.create = async (uid, b) => {
  const all = (await db().ref(`projects/${uid}`).get()).val() || {};
  if (Object.keys(all).length >= LIMITS.maxProjectsPerUser) {
    throw httpError(403, `You can have up to ${LIMITS.maxProjectsPerUser} projects. Delete one first.`);
  }
  let name = sanitizeName(b.name);
  const taken = new Set(Object.values(all).map((m) => m.name));
  if (taken.has(name)) { // never silently clash with an existing project
    let i = 2;
    while (taken.has(`${name} (${i})`)) i++;
    name = `${name} (${i})`;
  }
  const pid = newId();
  const draft = {};
  const seed = b.template === "starter" ? P.STARTER_FILES.map((f) => ({ path: f.path, content: f.content, enc: "utf8" })) : [];
  for (const f of seed) {
    const rec = buildFileRecord(f);
    draft[fileKey(rec.path)] = { ...rec, v: 1, t: now() };
  }
  const s = stats(draft);
  const meta = { name, createdAt: now(), updatedAt: now(), rev: 1, nextVersion: 1, ...s };
  await db().ref(mp(uid, pid)).set(meta);
  if (Object.keys(draft).length) await db().ref(dp(uid, pid)).set(draft);
  return { pid, meta: publicMeta(pid, meta) };
};

ACTIONS.get = async (uid, b) => {
  const pid = reqPid(b);
  const meta = await getMeta(uid, pid);
  const draft = await getDraft(uid, pid);
  return { meta: publicMeta(pid, meta), files: Object.values(draft).map(clientFile) };
};

ACTIONS.head = async (uid, b) => {
  const pid = reqPid(b);
  const m = await getMeta(uid, pid);
  return { rev: m.rev || 0, updatedAt: m.updatedAt, meta: publicMeta(pid, m) };
};

ACTIONS.rename = async (uid, b) => {
  const pid = reqPid(b);
  await getMeta(uid, pid);
  const name = sanitizeName(b.name);
  await db().ref(mp(uid, pid)).update({ name });
  return { ok: true, name };
};

ACTIONS.delete = async (uid, b) => {
  const pid = reqPid(b);
  const meta = await getMeta(uid, pid);
  await db().ref(dp(uid, pid)).remove();
  await db().ref(vp(uid, pid)).remove();
  await db().ref(`projectVersionFiles/${uid}/${pid}`).remove();
  await db().ref(ep(uid, pid)).remove();
  await db().ref(mp(uid, pid)).remove();
  if (meta.siteKey) await db().ref(`users/${uid}/sites/${meta.siteKey}/projectId`).remove();
  return { ok: true }; // a published site stays online until it is deleted separately
};

// The core editor operation. Everything in one request is validated first and
// applied together: moves -> deletes -> folders -> writes.
ACTIONS.save = async (uid, b) => {
  const pid = reqPid(b);
  const meta = await getMeta(uid, pid);
  const draft = await getDraft(uid, pid);
  const force = b.force === true;

  const state = new Map(); // path -> record
  for (const r of Object.values(draft)) state.set(r.path, { ...r });
  const original = new Map(state);
  const conflicts = [];
  const changed = new Set(); // paths written/moved
  const removed = new Set(); // paths that no longer exist

  // ---- moves / renames (files or whole folders)
  for (const m of Array.isArray(b.moves) ? b.moves : []) {
    const from = normalizePath(m.from), to = normalizePath(m.to);
    if (from === to) continue;
    if (to.startsWith(from + "/")) throw httpError(400, "A folder can't be moved into itself.");
    const group = [...state.keys()].filter((p) => p === from || p.startsWith(from + "/"));
    if (!group.length) throw httpError(404, `Not found: ${from}`);
    const incoming = new Set(group);
    for (const p of group) {
      const np = to + p.slice(from.length);
      normalizePath(np);
      const rec = state.get(p);
      if (!rec.dir) {
        if (!P.isAllowedPath(np)) throw httpError(400, `File type not allowed: ${np}`);
        if (isTextPath(np) !== isTextPath(p)) throw httpError(400, `Can't change ${p} between text and binary types.`);
      }
      if (state.has(np) && !incoming.has(np)) throw httpError(409, `"${np}" already exists.`);
    }
    // parent of the destination must not be an existing file
    const parts = to.split("/");
    for (let i = 1; i < parts.length; i++) {
      const par = state.get(parts.slice(0, i).join("/"));
      if (par && !par.dir) throw httpError(409, `"${parts.slice(0, i).join("/")}" is a file, not a folder.`);
    }
    for (const p of group) {
      const np = to + p.slice(from.length);
      const rec = state.get(p);
      state.delete(p); removed.add(p); changed.delete(p);
      state.set(np, { ...rec, path: np, v: (rec.v || 1) + 1, t: now() });
      removed.delete(np); changed.add(np);
    }
  }

  // ---- deletes (file or folder prefix)
  for (const d of Array.isArray(b.deletes) ? b.deletes : []) {
    const p = normalizePath(d);
    for (const k of [...state.keys()]) {
      if (k === p || k.startsWith(p + "/")) { state.delete(k); removed.add(k); changed.delete(k); }
    }
  }

  // ---- new folders
  for (const d of Array.isArray(b.mkdirs) ? b.mkdirs : []) {
    const p = normalizePath(d);
    const parts = p.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const sub = parts.slice(0, i).join("/");
      const ex = state.get(sub);
      if (ex && !ex.dir) throw httpError(409, `"${sub}" is a file, not a folder.`);
      if (!ex) { state.set(sub, { path: sub, dir: true, v: 1, t: now() }); removed.delete(sub); changed.add(sub); }
    }
  }

  // ---- writes (with optimistic conflict detection)
  const files = Array.isArray(b.files) ? b.files : [];
  if (files.length > 200) throw httpError(413, "Too many files in one request.");
  for (const f of files) {
    const rec = buildFileRecord(f);
    const ex = state.get(rec.path);
    const baseV = Number(f.baseV || 0);
    if (ex && ex.dir) throw httpError(409, `"${rec.path}" is a folder.`);
    const parts = rec.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const sub = parts.slice(0, i).join("/");
      const par = state.get(sub);
      if (par && !par.dir) throw httpError(409, `"${sub}" is a file, not a folder.`);
    }
    if (ex) {
      if (!force && (ex.v || 0) !== baseV) {
        conflicts.push({ path: rec.path, serverV: ex.v || 0, reason: baseV === 0 ? "exists" : "changed" });
        continue;
      }
      state.set(rec.path, { ...rec, v: (ex.v || 0) + 1, t: now() });
    } else {
      if (!force && baseV > 0) { conflicts.push({ path: rec.path, serverV: 0, reason: "deleted" }); continue; }
      state.set(rec.path, { ...rec, v: 1, t: now() });
    }
    removed.delete(rec.path); changed.add(rec.path);
  }

  if (conflicts.length) {
    throw httpError(409, "Some files changed somewhere else (another tab or device).", { conflicts, rev: meta.rev || 0 });
  }

  const finalMap = {};
  for (const [p, r] of state) finalMap[fileKey(p)] = r;
  checkBatchLimits(finalMap);

  // ---- diff -> single multi-path update
  const updates = {};
  for (const [p] of original) if (!state.has(p)) updates[fileKey(p)] = null;
  for (const p of changed) if (state.has(p)) updates[fileKey(p)] = state.get(p);
  if (Object.keys(updates).length) await db().ref(dp(uid, pid)).update(updates);

  const s = stats(finalMap);
  const rev = (meta.rev || 0) + 1;
  const updatedAt = now();
  if (Object.keys(updates).length) await db().ref(mp(uid, pid)).update({ rev, updatedAt, ...s });
  return {
    ok: true, rev: Object.keys(updates).length ? rev : meta.rev || 0, updatedAt,
    files: [...changed].filter((p) => state.has(p)).map((p) => ({ path: p, v: state.get(p).v, dir: !!state.get(p).dir })),
    removed: [...removed].filter((p) => !state.has(p)),
    ...s,
  };
};

ACTIONS.versions = async (uid, b) => {
  const pid = reqPid(b);
  const meta = await getMeta(uid, pid);
  const all = (await db().ref(vp(uid, pid)).get()).val() || {};
  const versions = Object.entries(all)
    .map(([vid, v]) => ({ vid, ...v, live: vid === meta.liveVid }))
    .sort((a, c) => c.n - a.n);
  return { versions, liveVid: meta.liveVid || null };
};

ACTIONS.snapshot = async (uid, b) => {
  const pid = reqPid(b);
  const meta = await getMeta(uid, pid);
  const draft = await getDraft(uid, pid);
  if (!Object.keys(draft).length) throw httpError(400, "The project is empty — nothing to snapshot.");
  const v = await createVersion(uid, pid, meta, draft, { kind: "manual", label: sanitizeName(b.label, "Manual snapshot") });
  return { ok: true, version: v };
};

ACTIONS.getVersion = async (uid, b) => {
  const pid = reqPid(b);
  const vid = String(b.vid || "");
  if (!/^\d{5}$/.test(vid)) throw httpError(400, "Invalid version.");
  await getMeta(uid, pid);
  const v = (await db().ref(vp(uid, pid, vid)).get()).val();
  if (!v) throw httpError(404, "Version not found.");
  const files = Object.values((await db().ref(vfp(uid, pid, vid)).get()).val() || {}).map(clientFile);
  return { version: { vid, ...v }, files };
};

// Restore replaces the DRAFT only. It never touches the live site.
ACTIONS.restore = async (uid, b) => {
  const pid = reqPid(b);
  const vid = String(b.vid || "");
  if (!/^\d{5}$/.test(vid)) throw httpError(400, "Invalid version.");
  let meta = await getMeta(uid, pid);
  const v = (await db().ref(vp(uid, pid, vid)).get()).val();
  if (!v) throw httpError(404, "Version not found.");
  const snap = (await db().ref(vfp(uid, pid, vid)).get()).val() || {};
  const draft = await getDraft(uid, pid);
  let backup = null;
  if (Object.keys(draft).length) {
    backup = await createVersion(uid, pid, meta, draft, { kind: "backup", label: `Auto-backup before restoring v${v.n}` });
    meta = await getMeta(uid, pid);
  }
  const prevV = {};
  for (const r of Object.values(draft)) prevV[r.path] = r.v || 1;
  const next = {};
  for (const r of Object.values(snap)) next[fileKey(r.path)] = { ...r, v: (prevV[r.path] || 0) + 1, t: now() };
  await db().ref(dp(uid, pid)).set(Object.keys(next).length ? next : null);
  const rev = (meta.rev || 0) + 1;
  await db().ref(mp(uid, pid)).update({ rev, updatedAt: now(), restoredFrom: v.n, ...stats(next) });
  return { ok: true, rev, backup, restoredVersion: v.n };
};

ACTIONS.deleteVersion = async (uid, b) => {
  const pid = reqPid(b);
  const vid = String(b.vid || "");
  if (!/^\d{5}$/.test(vid)) throw httpError(400, "Invalid version.");
  const meta = await getMeta(uid, pid);
  if (vid === meta.liveVid) throw httpError(409, "The live version can't be deleted.");
  await db().ref(vfp(uid, pid, vid)).remove();
  await db().ref(vp(uid, pid, vid)).remove();
  return { ok: true };
};

// Draft -> Published. The ONLY place a project goes live.
ACTIONS.publish = async (uid, b) => {
  const pid = reqPid(b);
  const meta = await getMeta(uid, pid);
  const draft = await getDraft(uid, pid);
  const entries = Object.values(draft);
  const indexRec = entries.find((r) => !r.dir && r.path === "index.html");
  if (!indexRec) throw httpError(400, "Your project needs an index.html file at its root before it can be published.");

  let siteKey = meta.siteKey, sitePath = meta.sitePath;
  let existing = null;
  if (siteKey) {
    existing = (await db().ref(`sitesPublic/${siteKey}`).get()).val();
    if (existing && existing.ownerUid !== uid) throw httpError(403, "You don't own this website.");
  } else {
    const parsed = parsePath(b.path);
    if (!parsed.ok) {
      throw httpError(400, "Invalid address. Use lowercase letters, numbers and hyphens, optionally followed by .webora.app, .webora.online or .webora.site");
    }
    siteKey = pathToKey(parsed.path);
    sitePath = parsed.path;
    existing = (await db().ref(`sitesPublic/${siteKey}`).get()).val();
    if (existing) throw httpError(409, "This address is already taken. If it is one of your existing sites, open it in Studio from your dashboard.");
    // No limit on the number of websites an account can publish.
  }

  // 1) automatic snapshot of exactly what is being published
  const ver = await createVersion(uid, pid, meta, draft, { kind: "publish", label: String(b.versionLabel || "").slice(0, 80) });

  // 2) deploy published files (separate from the draft)
  const files = {};
  for (const [k, r] of Object.entries(draft)) {
    if (r.dir) continue;
    files[k] = { path: r.path, enc: r.enc, data: r.data, size: r.size };
  }
  await db().ref(`sitesFiles/${siteKey}`).set(files);

  const t = now();
  const title = sanitizeName(b.title || (existing && existing.title) || meta.name, meta.name).slice(0, 150);
  const description = String(b.description != null ? b.description : (existing && existing.description) || "").slice(0, 300);
  const record = {
    title, description,
    html: indexRec.data, css: "", js: "", // html kept for sitemap/legacy readers
    path: sitePath, ownerUid: uid,
    viaApi: existing ? !!existing.viaApi : false,
    multi: true, projectId: pid, version: ver.n,
    createdAt: existing ? existing.createdAt || t : t, updatedAt: t,
  };
  await db().ref(`sitesPublic/${siteKey}`).set(record);
  await db().ref(`users/${uid}/sites/${siteKey}`).update({ path: sitePath, title, updatedAt: t, projectId: pid });
  await db().ref(mp(uid, pid)).update({ siteKey, sitePath, publishedAt: t, publishedVersion: ver.n, liveVid: ver.vid });

  const DOMAIN = process.env.PUBLIC_DOMAIN || "https://webora-lovat.vercel.app";
  return { ok: true, path: sitePath, url: `${DOMAIN}/${sitePath}`, version: ver.n, vid: ver.vid, publishedAt: t };
};

// Opens an existing (single-file) site in Studio without changing it.
ACTIONS.importSite = async (uid, b) => {
  const siteKey = String(b.siteKey || "");
  if (!siteKey || /[.#$\[\]\/]/.test(siteKey)) throw httpError(400, "Invalid site.");
  const site = (await db().ref(`sitesPublic/${siteKey}`).get()).val();
  if (!site) throw httpError(404, "Website not found.");
  if (site.ownerUid !== uid) throw httpError(403, "You don't own this website.");

  const link = (await db().ref(`users/${uid}/sites/${siteKey}/projectId`).get()).val() || site.projectId;
  if (link && (await db().ref(mp(uid, link)).get()).exists()) return { pid: link, existing: true };

  const all = (await db().ref(`projects/${uid}`).get()).val() || {};
  if (Object.keys(all).length >= LIMITS.maxProjectsPerUser) throw httpError(403, `You can have up to ${LIMITS.maxProjectsPerUser} projects.`);

  const draft = {};
  const put = (path, content) => { const rec = buildFileRecord({ path, content, enc: "utf8" }); draft[fileKey(path)] = { ...rec, v: 1, t: now() }; };
  if (site.multi) {
    const pub = (await db().ref(`sitesFiles/${siteKey}`).get()).val() || {};
    for (const r of Object.values(pub)) draft[fileKey(r.path)] = { ...r, v: 1, t: now() };
  } else {
    let html = String(site.html || "");
    const css = String(site.css || ""), js = String(site.js || "");
    if (css.trim()) {
      put("style.css", css);
      const tag = '<link rel="stylesheet" href="style.css">';
      html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, tag + "</head>") : tag + html;
    }
    if (js.trim()) {
      put("script.js", js);
      const tag = '<script src="script.js"></script>';
      html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tag + "</body>") : html + tag;
    }
    put("index.html", html);
  }
  checkBatchLimits(draft);
  const pid = newId();
  const s = stats(draft);
  const t = now();
  const meta = {
    name: sanitizeName(site.title || site.path), createdAt: t, updatedAt: t, rev: 1, nextVersion: 1,
    siteKey, sitePath: site.path, publishedAt: site.updatedAt || t, ...s,
  };
  await db().ref(mp(uid, pid)).set(meta);
  await db().ref(dp(uid, pid)).set(draft);
  const ver = await createVersion(uid, pid, meta, draft, { kind: "import", label: "Imported from your live website" });
  await db().ref(mp(uid, pid)).update({ liveVid: ver.vid, publishedVersion: ver.n, publishedAt: site.updatedAt || t, updatedAt: (site.updatedAt || t) });
  await db().ref(`users/${uid}/sites/${siteKey}/projectId`).set(pid);
  return { pid, existing: false };
};

// ------------------------------------------------------------ env variables
// projectEnv/{uid}/{pid}/{key} = { type: "config"|"secret", value, updatedAt }
// "config" values are injected into the published site as `window.ENV`.
// "secret" values are never sent to the browser or the published site —
// they're stored for the owner's own reference only (a static site has no
// server runtime of its own, so there's nowhere safe to use a real secret
// at request time). This is explained in the in-Studio Docs panel.
const ENV_KEY_RE = /^[A-Z][A-Z0-9_]{0,59}$/;
const ep = (uid, pid) => `projectEnv/${uid}/${pid}`;

function maskSecret(v) {
  const s = String(v == null ? "" : v);
  if (s.length <= 4) return "••••";
  return s.slice(0, 2) + "••••" + s.slice(-2);
}

ACTIONS.listEnv = async (uid, b) => {
  const pid = reqPid(b);
  await getMeta(uid, pid);
  const all = (await db().ref(ep(uid, pid)).get()).val() || {};
  const vars = Object.entries(all).map(([key, r]) => ({
    key, type: r.type === "secret" ? "secret" : "config",
    value: r.type === "secret" ? maskSecret(r.value) : r.value,
    updatedAt: r.updatedAt,
  })).sort((a, b2) => a.key.localeCompare(b2.key));
  return { vars };
};

ACTIONS.setEnv = async (uid, b) => {
  const pid = reqPid(b);
  await getMeta(uid, pid);
  const key = String(b.key || "").trim().toUpperCase();
  if (!ENV_KEY_RE.test(key)) throw httpError(400, "Variable names must be UPPER_SNAKE_CASE, starting with a letter (max 60 chars).");
  const type = b.type === "secret" ? "secret" : "config";
  const value = String(b.value == null ? "" : b.value).slice(0, 4000);
  if (!value) throw httpError(400, "Value can't be empty.");
  const rec = { type, value, updatedAt: now() };
  await db().ref(`${ep(uid, pid)}/${key}`).set(rec);
  return { ok: true, key, type, value: type === "secret" ? maskSecret(value) : value };
};

ACTIONS.deleteEnv = async (uid, b) => {
  const pid = reqPid(b);
  await getMeta(uid, pid);
  const key = String(b.key || "").trim().toUpperCase();
  await db().ref(`${ep(uid, pid)}/${key}`).remove();
  return { ok: true };
};

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const user = await verifyIdToken(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const fn = Object.prototype.hasOwnProperty.call(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!fn) return res.status(400).json({ error: "Unknown action." });
    const out = await fn(user.uid, body);
    return res.status(200).json(out);
  } catch (e) {
    if (!e.status || e.status >= 500) console.error(e);
    return res.status(e.status || 500).json({ error: e.message || "Request failed.", ...(e.extra || {}) });
  }
};
module.exports.ACTIONS = ACTIONS;
