// Webora Studio — multi-file editor: explorer, tabs, CodeMirror, live preview,
// autosave with draft recovery, versions, AI drawer, publish.
import { auth, onAuthStateChanged } from "/assets/firebase-client.js";
import { api } from "/assets/api.js";
import { esc, $, icons, hideLoader, toast, modal, confirmBox, promptBox } from "/assets/layout.js";
import { initFx } from "/assets/fx.js";
import * as U from "/assets/fileutil.js";
import { buildPreview } from "/assets/preview.js";
import { exportZip, uploadBatches } from "/assets/zip.js";
import { mountAIGenerator } from "/assets/aigen.js";

const pid = new URLSearchParams(location.search).get("pid");
const S = {
  meta: null, files: new Map(), tabs: [], active: null, openDirs: new Set(), sel: null, rev: 0,
  side: "files", mobile: "code", viewVersion: null, muted: false, sbw: true,
};
const CM = window.CodeMirror || null;
let cm = null, plain = null, saveTimer, retryTimer, retryN = 0, saveChain = Promise.resolve(), saveState = "saved", pvTimer, backupTimer, headTimer;
const SUFFIXES = ["webora.app", "webora.online", "webora.site"];

// ───────────────────────────────────────── helpers
const fileOf = (p) => S.files.get(p);
const activeFile = () => (S.active ? S.files.get(S.active) : null);
const modeFor = (p) => ({ html: "htmlmixed", htm: "htmlmixed", css: "css", js: "javascript", mjs: "javascript", json: { name: "javascript", json: true }, svg: "xml", xml: "xml", webmanifest: { name: "javascript", json: true }, md: "markdown" }[U.extOf(p)] || null);
const colorOf = (p) => ({ html: "fc-html", htm: "fc-html", css: "fc-css", js: "fc-js", mjs: "fc-js", json: "fc-json" }[U.extOf(p)] || (U.isImage(p) ? "fc-img" : "fc-o"));
const prettyType = (p) => ({ html: "HTML", htm: "HTML", css: "CSS", js: "JavaScript", mjs: "JavaScript", json: "JSON", svg: "SVG", md: "Markdown", txt: "Plain text" }[U.extOf(p)] || (U.extOf(p) || "file").toUpperCase());

function getText(f) {
  if (!f || f.dir || f.enc !== "utf8") return null;
  if (f.doc) return f.doc.getValue();
  if (plain && S.active === f.path) return plain.value;
  return f.cur !== undefined ? f.cur : f.data;
}
const anyDirty = () => [...S.files.values()].some((f) => f.dirty);

function ensureDoc(f) {
  if (f.doc || !CM) return f.doc;
  f.doc = new CM.Doc(f.cur !== undefined ? f.cur : f.data, modeFor(f.path));
  f.doc.on("change", () => onEdit(f));
  return f.doc;
}

// ───────────────────────────────────────── layout
function buildUI() {
  document.body.classList.add("studio");
  $("app").innerHTML = `
  <div class="st">
    <div class="st-top">
      <a class="ib" href="/dashboard.html" title="Back to dashboard" aria-label="Back">${icons.back}</a>
      <a class="brand" href="/dashboard.html">${window.WeboraLogo ? window.WeboraLogo("static") : ""}</a>
      <input class="st-name" id="pname" maxlength="60" aria-label="Project name">
      <span class="pill draft" id="pubPill">Draft</span>
      <div class="sp"></div>
      <span class="save-pill saved" id="savePill"><i></i><span>Saved</span></span>
      <button class="ib" id="btnSide" title="Toggle explorer (Ctrl+B)">${icons.folder}</button>
      <button class="btn sm outline" id="btnAI" title="AI Website Generator">${icons.sparkle}<span class="lbl">AI</span></button>
      <button class="btn sm outline" id="btnVer" title="Version history">${icons.history}<span class="lbl">Versions</span></button>
      <a class="btn sm outline" id="btnStats" href="#" style="display:none" title="Analytics">${icons.chart}<span class="lbl">Analytics</span></a>
      <button class="btn sm outline" id="btnZip" title="Download project as ZIP">${icons.download}<span class="lbl">ZIP</span></button>
      <button class="btn sm primary" id="btnPub">${icons.rocket}<span class="lbl">Publish</span></button>
    </div>
    <div class="st-main" id="main">
      <section class="pane pane-side" id="pSide">
        <div class="side-tabs"><button class="on" data-st="files">FILES</button><button data-st="search">SEARCH</button></div>
        <div id="sideFiles" style="display:flex;flex-direction:column;min-height:0;flex:1">
          <div class="pane-h"><span class="ttl">Explorer</span>
            <button class="ib" id="aNewFile" title="New file">${icons.newfile}</button>
            <button class="ib" id="aNewDir" title="New folder">${icons.newfolder}</button>
            <button class="ib" id="aUpFiles" title="Upload files">${icons.upload}</button>
            <button class="ib" id="aUpDir" title="Upload folder">${icons.folder}</button></div>
          <div class="tree" id="tree" tabindex="0"></div>
        </div>
        <div id="sideSearch" style="display:none;flex-direction:column;min-height:0;flex:1">
          <div class="sr-in"><input class="inp" id="sq" placeholder="Search in all files…"><button class="ib" id="sCase" title="Match case">Aa</button></div>
          <div class="sr-list" id="sres"></div>
        </div>
        <input type="file" id="inFiles" multiple hidden><input type="file" id="inDir" webkitdirectory multiple hidden>
      </section>
      <section class="pane" id="pEdit">
        <div class="tabsbar" id="tabs"></div>
        <div id="sbanner" class="sbanner" style="display:none"></div>
        <div class="pane-h" style="min-height:38px;padding:3px 8px">
          <span class="ttl" id="curFile" style="text-transform:none;letter-spacing:.3px;font-family:Inter;font-size:12px;color:var(--muted)"></span>
          <button class="ib" id="eFind" title="Find (Ctrl+F)">${icons.search}</button>
          <button class="ib" id="eRepl" title="Find & replace (Ctrl+H)">${icons.edit}</button>
          <button class="ib" id="eFmt" title="Format code (Shift+Alt+F)">{ }</button>
          <button class="ib" id="eFold" title="Fold all / unfold (Ctrl+Alt+[ )">${icons.more}</button>
          <button class="ib" id="eSave" title="Save now (Ctrl+S)">${icons.save}</button>
        </div>
        <div class="edwrap"><div class="edhost" id="edhost"></div><div class="binview" id="binview"></div>
          <div class="welcome" id="welcome"><div style="width:90px;margin:0 auto">${window.WeboraLogo ? window.WeboraLogo("anim") : ""}</div><b style="color:#fff;font-family:var(--font-d)">Open a file to start editing</b><span>Pick a file from the explorer, or create one with the + button.</span></div></div>
        <div class="edfoot"><span id="fPos">Ln 1, Col 1</span><span id="fType"></span><span id="fSize"></span><span style="margin-left:auto" id="fHint">Ctrl+S save · Ctrl+Space suggest</span></div>
      </section>
      <section class="pane" id="pPrev"></section>
    </div>
    <div class="mtabs" id="mtabs">
      <button data-m="files">${icons.folder}FILES</button><button data-m="code" class="on">${icons.code}CODE</button><button data-m="preview">${icons.eye}PREVIEW</button>
    </div>
  </div>`;
  $("pPrev").innerHTML = previewMarkup(true);
}
function previewMarkup(withFs) {
  return `
    <div class="vbanner" style="display:none" data-vb></div>
    <div class="pv-bar">
      <span class="ttl" style="font:700 11px var(--font-d);letter-spacing:1.5px;color:#7ea2ff;margin-right:6px">PREVIEW</span>
      <button class="ib on" data-dev="desktop" title="Desktop">${icons.desktop}</button>
      <button class="ib" data-dev="tablet" title="Tablet (768px)">${icons.tablet}</button>
      <button class="ib" data-dev="mobile" title="Mobile (390px)">${icons.mobile}</button>
      <select data-page title="Page to preview"></select>
      <span class="sp"></span>
      <button class="ib" data-con title="Console / errors"><span data-conl>${icons.warn}</span><span class="badge" data-badge style="display:none"></span></button>
      <button class="ib" data-refresh title="Refresh preview (Ctrl+Enter)">${icons.refresh}</button>
      ${withFs ? `<button class="ib" data-full title="Full screen">${icons.full}</button>` : `<button class="ib" data-close title="Close (Esc)">${icons.x}</button>`}
    </div>
    <div class="pv-stage desktop" data-stage>
      <iframe class="pv-frame" data-frame sandbox="allow-scripts allow-forms allow-popups allow-modals" title="Website preview"></iframe>
      <div class="pv-load" data-load>${window.WeboraLogo ? window.WeboraLogo("anim") : ""}</div>
    </div>
    <div class="pv-console" data-console style="display:none"></div>`;
}

// ───────────────────────────────────────── live preview (works for the pane and full screen)
function workingMap() {
  if (S.viewVersion) return S.viewVersion.map;
  const m = new Map();
  for (const f of S.files.values()) if (!f.dir) m.set(f.path, { path: f.path, enc: f.enc, data: f.enc === "utf8" ? getText(f) : f.data });
  return m;
}
const previews = new Set();
function makePreview(root) {
  const q = (s) => root.querySelector(s);
  const frame = q("[data-frame]"), stage = q("[data-stage]");
  let device = "desktop", page = "index.html", msgs = [], loadT;
  const api_ = {
    render() {
      load(true);
      const map = workingMap();
      if (!map.has(page)) page = map.has("index.html") ? "index.html" : [...map.keys()].find((k) => /\.html?$/i.test(k)) || "index.html";
      let out;
      try { out = buildPreview(map, page); } catch (e) { out = { html: `<pre style="color:#f66;padding:16px">Preview error: ${esc(e.message)}</pre>`, warnings: [e.message], pages: [] }; }
      msgs = out.warnings.map((m) => ({ k: "warn", m }));
      const sel = q("[data-page]");
      sel.innerHTML = out.pages.map((p) => `<option ${p === page ? "selected" : ""}>${esc(p)}</option>`).join("") || `<option>${esc(page)}</option>`;
      con();
      frame.srcdoc = out.html;
      clearTimeout(loadT); loadT = setTimeout(() => load(false), 4000);
    },
    fit() {
      if (device === "desktop") { frame.style.cssText = ""; stage.classList.add("desktop"); return; }
      stage.classList.remove("desktop");
      const W = device === "tablet" ? 768 : 390, avail = stage.clientWidth - 16, s = Math.min(1, avail / W);
      frame.style.width = W + "px"; frame.style.height = Math.max(200, (stage.clientHeight - 16) / s) + "px";
      frame.style.transform = `scale(${s})`; frame.style.margin = "8px 0"; frame.style.marginRight = -(W - W * s) + "px";
    },
    destroy() { removeEventListener("message", onMsg); previews.delete(api_); ro.disconnect(); },
  };
  const load = (on) => q("[data-load]").classList.toggle("on", on);
  function con() {
    const errs = msgs.filter((m) => m.k === "error").length, badge = q("[data-badge]");
    badge.style.display = msgs.length ? "inline-grid" : "none"; badge.textContent = msgs.length; badge.style.background = errs ? "#fb7185" : "#f5b53d";
    q("[data-console]").innerHTML = msgs.map((m) => `<div class="ln ${m.k}">${m.k === "error" ? "✖" : m.k === "warn" ? "⚠" : "›"} ${esc(m.m)}${m.l ? ` <span style="opacity:.6">(line ${m.l})</span>` : ""}</div>`).join("") || `<div class="ln log">No errors or warnings.</div>`;
  }
  function onMsg(e) {
    if (e.source !== frame.contentWindow) return;
    const d = e.data; if (!d || !d.wp) return;
    if (d.k === "loaded") load(false);
    else if (d.k === "nav") { page = d.p; api_.render(); }
    else if (["error", "warn", "log"].includes(d.k)) { if (msgs.length < 60) msgs.push(d); con(); }
  }
  addEventListener("message", onMsg);
  root.querySelectorAll("[data-dev]").forEach((b) => (b.onclick = () => { device = b.dataset.dev; root.querySelectorAll("[data-dev]").forEach((x) => x.classList.toggle("on", x === b)); api_.fit(); }));
  q("[data-page]").onchange = (e) => { page = e.target.value; api_.render(); };
  q("[data-refresh]").onclick = () => api_.render();
  q("[data-con]").onclick = () => { const c = q("[data-console]"); c.style.display = c.style.display === "none" ? "block" : "none"; };
  const ro = new ResizeObserver(() => api_.fit()); ro.observe(stage);
  previews.add(api_);
  return api_;
}
let mainPreview;
const refreshPreviews = () => previews.forEach((p) => p.render());
function schedulePreview(ms = 450) { clearTimeout(pvTimer); pvTimer = setTimeout(refreshPreviews, ms); }

function openFullscreen() {
  const fs = document.createElement("div"); fs.className = "fs"; fs.innerHTML = previewMarkup(false); document.body.appendChild(fs);
  const p = makePreview(fs);
  const close = () => { p.destroy(); fs.remove(); document.removeEventListener("keydown", k); };
  const k = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", k);
  fs.querySelector("[data-close]").onclick = close;
  p.render();
}

// ───────────────────────────────────────── explorer
function buildTree() {
  const root = { dirs: new Map(), files: [] };
  const dir = (parts) => { let n = root; for (const s of parts) { if (!n.dirs.has(s)) n.dirs.set(s, { dirs: new Map(), files: [] }); n = n.dirs.get(s); } return n; };
  for (const f of S.files.values()) {
    const parts = f.path.split("/");
    if (f.dir) dir(parts); else dir(parts.slice(0, -1)).files.push(f);
  }
  return root;
}
function renderTree() {
  const rows = [];
  const walk = (node, prefix, depth) => {
    for (const name of [...node.dirs.keys()].sort((a, b) => a.localeCompare(b))) {
      const p = prefix + name, open = S.openDirs.has(p);
      rows.push(`<div class="tr ${open ? "open" : ""} ${S.sel === p ? "sel" : ""}" data-k="dir" data-p="${esc(p)}" style="padding-left:${6 + depth * 14}px"><svg class="icon chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg><span class="fc-dir">${icons.folder}</span><span class="nm">${esc(name)}</span><button class="ib more" data-more aria-label="Actions">${icons.more}</button></div>`);
      if (open) walk(node.dirs.get(name), p + "/", depth + 1);
    }
    for (const f of node.files.sort((a, b) => a.path.localeCompare(b.path))) {
      rows.push(`<div class="tr ${S.active === f.path ? "sel" : ""}" data-k="file" data-p="${esc(f.path)}" style="padding-left:${24 + depth * 14}px"><span class="${colorOf(f.path)}">${icons.file}</span><span class="nm">${esc(U.baseName(f.path))}</span>${f.dirty ? '<i class="dd"></i>' : ""}<button class="ib more" data-more aria-label="Actions">${icons.more}</button></div>`);
    }
  };
  walk(buildTree(), "", 0);
  $("tree").innerHTML = rows.join("") || `<div class="empty">No files yet.<br>Create one with the + button, or upload files.</div>`;
}
function targetDirOf(p) { if (!p) return ""; const f = fileOf(p); return f && !f.dir ? U.dirName(p) : p; }

let menuEl;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
function openMenu(x, y, p) {
  closeMenu();
  const f = fileOf(p), isDir = f && f.dir;
  menuEl = document.createElement("div"); menuEl.className = "menu";
  const items = [
    ["newfile", icons.newfile, "New file here"], ["newdir", icons.newfolder, "New folder here"], ["upload", icons.upload, "Upload files here"],
    ["rename", icons.edit, "Rename / move"], ...(isDir ? [] : [["dup", icons.file, "Duplicate"], ["dl", icons.download, "Download file"]]), ["del", icons.trash, "Delete"],
  ];
  menuEl.innerHTML = items.map(([a, ic, l]) => `<button data-a="${a}" class="${a === "del" ? "dng" : ""}">${ic}${l}</button>`).join("");
  document.body.appendChild(menuEl);
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 6)) + "px"; menuEl.style.top = Math.max(6, Math.min(y, innerHeight - r.height - 6)) + "px";
  menuEl.onclick = (e) => { const a = e.target.closest("[data-a]"); if (!a) return; closeMenu(); fileAction(a.dataset.a, p); };
}
document.addEventListener("pointerdown", (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });

async function fileAction(a, p) {
  const dir = targetDirOf(p);
  try {
    if (a === "newfile") return await newFile(dir);
    if (a === "newdir") return await newFolder(dir);
    if (a === "upload") { S.uploadDir = dir; return $("inFiles").click(); }
    if (a === "rename") return await renameItem(p);
    if (a === "del") return await deleteItem(p);
    if (a === "dup") return await duplicate(p);
    if (a === "dl") return downloadFile(p);
  } catch (e) { toast(e.message, "err"); }
}
async function newFile(dir = "") {
  const v = await promptBox("New file", "File name (e.g. about.html, css/theme.css)", dir ? dir + "/" : "", "Create");
  if (!v) return;
  const path = U.normalizePath(v);
  if (!U.isText(path)) throw new Error("You can create text files here (html, css, js, json, svg, txt, md…). Use Upload for images and fonts.");
  if (fileOf(path)) throw new Error(`"${path}" already exists.`);
  await structural({ files: [{ path, content: "", enc: "utf8", baseV: 0 }] });
  openFile(path);
  toast("File created", "ok");
}
async function newFolder(dir = "") {
  const v = await promptBox("New folder", "Folder name (e.g. images, assets/fonts)", dir ? dir + "/" : "", "Create");
  if (!v) return;
  const path = U.normalizePath(v);
  if (fileOf(path)) throw new Error(`"${path}" already exists.`);
  await structural({ mkdirs: [path] });
  S.openDirs.add(path); renderTree();
}
async function renameItem(p) {
  const v = await promptBox("Rename / move", "New path", p, "Rename");
  if (!v || v === p) return;
  const to = U.normalizePath(v);
  if (fileOf(to)) throw new Error(`"${to}" already exists.`);
  await structural({ moves: [{ from: p, to }] });
  toast("Renamed", "ok");
}
async function deleteItem(p) {
  const f = fileOf(p), isDir = f && f.dir;
  const n = isDir ? [...S.files.keys()].filter((k) => k.startsWith(p + "/")).length : 0;
  if (!(await confirmBox(`Delete ${isDir ? "folder" : "file"}?`, `"${p}"${isDir ? ` and its ${n} item(s)` : ""} will be deleted from your draft. Version snapshots keep older copies.`, "Delete", true))) return;
  await structural({ deletes: [p] });
  toast("Deleted", "ok");
}
async function duplicate(p) {
  const f = fileOf(p), i = p.lastIndexOf("."), np = i > p.lastIndexOf("/") ? `${p.slice(0, i)}-copy${p.slice(i)}` : p + "-copy";
  if (fileOf(np)) throw new Error(`"${np}" already exists.`);
  await structural({ files: [{ path: np, content: f.enc === "utf8" ? getText(f) : f.data, enc: f.enc, baseV: 0 }] });
  openFile(np);
}
function downloadFile(p) {
  const f = fileOf(p);
  const blob = f.enc === "utf8" ? new Blob([getText(f)], { type: U.mimeOf(p) }) : new Blob([U.base64ToBytes(f.data)], { type: U.mimeOf(p) });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = U.baseName(p); document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// Structural change (create / rename / delete / mkdir): saves pending edits first, calls the server, then mirrors the result locally.
async function structural(payload) {
  await flushSaves();
  if (saveState === "failed") throw new Error("Pending changes couldn't be saved yet — fix that first.");
  setSave("saving");
  let r;
  try { r = await api("save", { pid, ...payload }); }
  catch (e) {
    setSave(anyDirty() ? "dirty" : "saved");
    if (e.status === 409 && e.data && e.data.conflicts) { await syncFromServer(); throw new Error("Files changed elsewhere — your view was refreshed. Try again."); }
    throw e;
  }
  S.rev = r.rev;
  for (const m of payload.moves || []) applyMove(m.from, m.to);
  for (const d of payload.deletes || []) applyDelete(d);
  for (const d of payload.mkdirs || []) { const parts = d.split("/"); for (let i = 1; i <= parts.length; i++) { const sub = parts.slice(0, i).join("/"); if (!fileOf(sub)) S.files.set(sub, { path: sub, dir: true, v: 1, enc: "utf8", data: "", dirty: false }); } }
  for (const f of payload.files || []) {
    const sv = (r.files.find((x) => x.path === f.path) || {}).v || 1;
    S.files.set(f.path, { path: f.path, enc: f.enc, data: f.content, size: 0, v: sv, dirty: false });
    const parts = f.path.split("/"); for (let i = 1; i < parts.length; i++) S.openDirs.add(parts.slice(0, i).join("/"));
  }
  S.meta.updatedAt = r.updatedAt; S.meta.fileCount = r.fileCount; S.meta.totalBytes = r.totalBytes; S.meta.hasUnpublished = !!S.meta.siteKey;
  setSave("saved"); renderAll(); schedulePreview(50); updatePubPill();
  return r;
}
function applyMove(from, to) {
  for (const [p, f] of [...S.files]) {
    if (p !== from && !p.startsWith(from + "/")) continue;
    const np = to + p.slice(from.length);
    if (!f.dir && f.enc === "utf8") { f.data = getText(f); f.cur = undefined; f.doc = null; }
    S.files.delete(p); f.path = np; S.files.set(np, f);
    const ti = S.tabs.indexOf(p); if (ti >= 0) S.tabs[ti] = np;
    if (S.active === p) S.active = np;
    if (S.sel === p) S.sel = np;
  }
  for (const d of [...S.openDirs]) if (d === from || d.startsWith(from + "/")) { S.openDirs.delete(d); S.openDirs.add(to + d.slice(from.length)); }
  const parts = to.split("/"); for (let i = 1; i < parts.length; i++) S.openDirs.add(parts.slice(0, i).join("/"));
  if (S.active) activate(S.active, { quiet: true });
}
function applyDelete(path) {
  for (const p of [...S.files.keys()]) if (p === path || p.startsWith(path + "/")) { S.files.delete(p); closeTab(p, true); }
}

// ───────────────────────────────────────── tabs + editor
function openFile(path, opts = {}) {
  const f = fileOf(path); if (!f || f.dir) return;
  if (!S.tabs.includes(path)) S.tabs.push(path);
  activate(path, opts);
  if (matchMedia("(max-width:1000px)").matches) setMobile("code");
}
function activate(path, { line, quiet } = {}) {
  // keep unsaved text of the file we are leaving (basic-editor mode)
  const prev = activeFile(); if (plain && prev && prev.enc === "utf8" && prev.path !== path) prev.cur = plain.value;
  if (!S.tabs.includes(path)) S.tabs.push(path);
  S.active = path; S.sel = path;
  const f = fileOf(path);
  const parts = path.split("/"); for (let i = 1; i < parts.length; i++) S.openDirs.add(parts.slice(0, i).join("/"));
  $("welcome").style.display = "none";
  if (f.enc === "utf8") {
    $("binview").style.display = "none"; $("edhost").style.display = "block";
    if (cm) { cm.swapDoc(ensureDoc(f)); cm.setOption("readOnly", false); setTimeout(() => { cm.refresh(); if (line) { cm.setCursor({ line: line - 1, ch: 0 }); cm.scrollIntoView({ line: line - 1, ch: 0 }, 120); } if (!quiet && !matchMedia("(max-width:1000px)").matches) cm.focus(); }, 0); }
    else if (plain) { plain.value = f.cur !== undefined ? f.cur : f.data; if (line) { const idx = plain.value.split("\n").slice(0, line - 1).join("\n").length; plain.setSelectionRange(idx, idx); } }
  } else {
    $("edhost").style.display = "none";
    const bv = $("binview"); bv.style.display = "flex";
    bv.innerHTML = `${U.isImage(path) ? `<img alt="" src="${U.dataUri(f)}">` : `<div class="${colorOf(path)}" style="transform:scale(3)">${icons.file}</div>`}<b style="color:#fff">${esc(U.baseName(path))}</b><span>${prettyType(path)} · ${U.fmtBytes(f.size || U.b64Size(f.data))} · read-only here</span><button class="btn sm outline" id="binDl">${icons.download} Download</button>`;
    $("binDl").onclick = () => downloadFile(path);
  }
  renderTabs(); renderTree(); updateFoot();
}
function closeTab(path, silent) {
  const i = S.tabs.indexOf(path); if (i < 0) return;
  S.tabs.splice(i, 1);
  if (S.active === path) {
    S.active = null;
    const next = S.tabs[i] || S.tabs[i - 1];
    if (next) activate(next, { quiet: true });
    else { $("edhost").style.display = "none"; $("binview").style.display = "none"; $("welcome").style.display = "grid"; renderTabs(); renderTree(); updateFoot(); }
  } else if (!silent) renderTabs();
}
function renderTabs() {
  $("tabs").innerHTML = S.tabs.map((p) => { const f = fileOf(p); return `<div class="etab ${p === S.active ? "on" : ""}" data-p="${esc(p)}" title="${esc(p)}"><span class="${colorOf(p)}">${icons.file}</span><span>${esc(U.baseName(p))}</span>${f && f.dirty ? '<i class="dd" title="Unsaved changes"></i>' : ""}<button class="x" data-x aria-label="Close">${icons.x}</button></div>`; }).join("");
  const on = $("tabs").querySelector(".on"); if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
  const f = activeFile(); $("curFile").textContent = f ? f.path : "";
}
function updateFoot() {
  const f = activeFile();
  $("fType").textContent = f ? prettyType(f.path) + " · UTF-8" : ""; $("fSize").textContent = f ? U.fmtBytes(f.enc === "utf8" ? U.utf8Size(getText(f)) : f.size || U.b64Size(f.data)) : "";
  if (cm && f && f.enc === "utf8") { const c = cm.getCursor(); $("fPos").textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`; } else $("fPos").textContent = "";
}

function initEditor() {
  const host = $("edhost");
  if (CM) {
    const keys = {
      "Ctrl-S": () => saveNow(true), "Cmd-S": () => saveNow(true), "Ctrl-Space": (c) => hint(c, true), "Ctrl-/": "toggleComment", "Cmd-/": "toggleComment",
      "Ctrl-H": "replace", "Cmd-Alt-F": "replace", "Ctrl-Enter": () => refreshPreviews(), "Cmd-Enter": () => refreshPreviews(), "Shift-Alt-F": () => formatActive(),
      "Ctrl-Alt-[": (c) => c.execCommand("foldAll"), "Ctrl-Alt-]": (c) => c.execCommand("unfoldAll"),
      Tab: (c) => (c.somethingSelected() ? c.indentSelection("add") : c.replaceSelection("  ", "end")), "Shift-Tab": (c) => c.indentSelection("subtract"),
      "Ctrl-Shift-F": () => setSide("search", true),
    };
    cm = CM(host, {
      value: "", theme: "webora", lineNumbers: true, tabSize: 2, indentUnit: 2, smartIndent: true, indentWithTabs: false, lineWrapping: false,
      autoCloseBrackets: true, autoCloseTags: true, matchBrackets: true, styleActiveLine: true, foldGutter: true,
      gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"], highlightSelectionMatches: { minChars: 2, showToken: /\w/ }, extraKeys: keys,
    });
    cm.on("cursorActivity", updateFoot);
    cm.on("inputRead", (c, ch) => { if (/[\w<./:-]/.test(ch.text[0] || "") && !c.state.completionActive) hint(c, false); });
  } else {
    plain = document.createElement("textarea"); plain.className = "plain"; plain.spellcheck = false; host.appendChild(plain);
    plain.oninput = () => { const f = activeFile(); if (f) onEdit(f); };
    plain.addEventListener("keydown", (e) => { if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "  "); } });
    toast("Advanced editor couldn't load (offline?). Using the basic editor.", "info", 5000);
  }
}
// autocompletion: project file paths in src/href, otherwise HTML / CSS / JS hints
function hint(c, force) {
  if (!CM || !CM.showHint) return;
  const cur = c.getCursor(), line = c.getLine(cur.line).slice(0, cur.ch);
  const m = /(?:src|href|url\()\s*=?\s*["']?([^"'\s)]*)$/.exec(line);
  if (m && /(?:src|href)\s*=\s*["'][^"']*$|url\(\s*["']?[^"')]*$/.test(line)) {
    const typed = m[1];
    const list = [...S.files.values()].filter((f) => !f.dir && f.path.toLowerCase().includes(typed.toLowerCase()) && f.path !== S.active).map((f) => f.path);
    if (!list.length) return;
    return c.showHint({ completeSingle: false, hint: () => ({ list, from: CM.Pos(cur.line, cur.ch - typed.length), to: cur }) });
  }
  const mode = c.getModeAt(cur).name, fn = mode === "css" ? CM.hint.css : mode === "javascript" ? CM.hint.javascript : CM.hint.html;
  if (!fn) return;
  c.showHint({ completeSingle: false, hint: fn, closeCharacters: /[\s()\[\]{};:>,]/ });
}
function formatActive() {
  const f = activeFile(); if (!f || f.enc !== "utf8") return toast("Open a text file to format.", "info");
  const ext = U.extOf(f.path), text = getText(f);
  const opt = { indent_size: 2, wrap_line_length: 120, end_with_newline: true, preserve_newlines: true, max_preserve_newlines: 2 };
  let out = null;
  try {
    if (["html", "htm"].includes(ext) && window.html_beautify) out = window.html_beautify(text, { ...opt, indent_inner_html: true, extra_liners: [], unformatted: ["code", "pre"], wrap_attributes: "auto" });
    else if (ext === "css" && window.css_beautify) out = window.css_beautify(text, opt);
    else if (["js", "mjs", "json", "webmanifest"].includes(ext) && window.js_beautify) out = window.js_beautify(text, { ...opt, space_in_empty_paren: false });
    else return toast(window.js_beautify ? `Formatting isn't available for .${ext} files.` : "Formatter library not loaded (offline?).", "info");
  } catch (e) { return toast("Couldn't format: " + e.message, "err"); }
  if (out === text) return toast("Already formatted", "ok");
  if (cm) { const pos = cm.getCursor(), sc = cm.getScrollInfo(); cm.operation(() => { cm.replaceRange(out, { line: 0, ch: 0 }, { line: cm.lineCount(), ch: 0 }); cm.setCursor(pos); cm.scrollTo(sc.left, sc.top); }); }
  else { plain.value = out; onEdit(f); }
  toast("Formatted", "ok");
}

// ───────────────────────────────────────── editing → autosave
function onEdit(f) {
  if (S.muted) return;
  f.dirty = true; f.conflict = false;
  setSave("dirty"); updateTabDot(f);
  scheduleSave(); scheduleBackup(); schedulePreview();
  if (S.active === f.path) updateFoot();
}
function updateTabDot(f) {
  renderTabs();
  const row = [...$("tree").querySelectorAll(".tr")].find((r) => r.dataset.p === f.path);
  if (row && !row.querySelector(".dd")) row.querySelector(".nm").insertAdjacentHTML("afterend", '<i class="dd"></i>');
  if (S.meta) { S.meta.hasUnpublished = !!S.meta.siteKey; updatePubPill(); }
}
function setSave(state, msg) {
  saveState = state;
  const p = $("savePill"); if (!p) return;
  p.className = "save-pill " + state;
  p.querySelector("span").textContent = { saved: "Saved", dirty: "Unsaved changes", saving: "Saving…", failed: msg ? "Save failed — " + msg.slice(0, 40) : "Save failed" }[state];
  p.title = state === "failed" ? (msg || "") + " (your changes are kept; retrying automatically)" : "";
}
function scheduleSave(ms = 1200) { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveNow(false), ms); }
function saveNow(manual = true) {
  clearTimeout(saveTimer);
  saveChain = saveChain.then(() => doSave(manual)).catch(() => {});
  return saveChain;
}
const flushSaves = () => saveNow(false);

async function doSave(manual) {
  const pending = [];
  for (const f of S.files.values()) {
    if (f.dir || f.enc !== "utf8" || !f.dirty) continue;
    const text = getText(f);
    if (text === f.data) { f.dirty = false; continue; }
    if (f.conflict && !manual) continue;
    pending.push({ f, text });
  }
  if (!pending.length) { if (saveState !== "failed" || !anyDirty()) setSave(anyDirty() ? "dirty" : "saved"); renderTabs(); return; }
  for (const { f } of pending) if (U.utf8Size(getText(f)) > U.LIMITS.maxFileBytes) { f.conflict = true; setSave("failed", `${U.baseName(f.path)} is too large`); toast(`${f.path} is larger than 2.5 MB and can't be saved.`, "err"); }
  const chunks = []; let cur = [], bytes = 0;
  for (const it of pending.filter((x) => !x.f.conflict || manual)) { if (cur.length && bytes + it.text.length > U.LIMITS.requestBytes) { chunks.push(cur); cur = []; bytes = 0; } cur.push(it); bytes += it.text.length; }
  if (cur.length) chunks.push(cur);
  setSave("saving");
  try {
    for (const ch of chunks) {
      let r;
      try { r = await api("save", { pid, files: ch.map(({ f, text }) => ({ path: f.path, content: text, enc: "utf8", baseV: f.v })) }); }
      catch (e) {
        if (e.status === 409 && e.data && e.data.conflicts) { await resolveConflicts(e.data.conflicts, ch); continue; }
        throw e;
      }
      for (const { f, text } of ch) { const nv = (r.files.find((x) => x.path === f.path) || {}).v; if (nv) f.v = nv; f.data = text; f.dirty = getText(f) !== text; }
      S.rev = r.rev; S.meta.updatedAt = r.updatedAt; S.meta.fileCount = r.fileCount; S.meta.totalBytes = r.totalBytes; S.meta.hasUnpublished = !!S.meta.siteKey;
    }
    retryN = 0; clearTimeout(retryTimer);
    setSave(anyDirty() ? (pending.some((x) => x.f.conflict) ? "failed" : "dirty") : "saved", pending.some((x) => x.f.conflict) ? "conflict" : "");
    if (anyDirty() && ![...S.files.values()].some((f) => f.conflict)) scheduleSave(800);
    renderTabs(); renderTree(); updatePubPill(); persistBackup();
  } catch (e) {
    setSave("failed", e.network ? "offline" : e.message);
    persistBackup();
    if (e.network || e.status >= 500 || !e.status) { retryN++; clearTimeout(retryTimer); retryTimer = setTimeout(() => saveNow(false), Math.min(30000, 2000 * 2 ** (retryN - 1))); }
    else if (e.status === 401) toast("You're signed out — log in again; your edits are kept in this tab.", "err", 6000);
    else toast(e.message, "err", 5000);
  }
}

// two tabs/devices edited the same file
async function resolveConflicts(conflicts, chunk) {
  const paths = conflicts.map((c) => c.path);
  for (const { f } of chunk) if (paths.includes(f.path)) f.conflict = true;
  setSave("failed", "conflict");
  const choice = await modal({
    title: "Changes conflict",
    body: `<p>These files were changed somewhere else (another tab or device) since you opened them:</p><div class="keybox" style="margin-bottom:10px">${paths.map(esc).join("<br>")}</div><p style="margin:0">Keep your version, or load the newer one? <b style="color:#fff">Keeping yours overwrites the other change.</b></p>`,
    actions: [{ label: "Decide later", value: "later" }, { label: "Use server version", value: "server" }, { label: "Keep mine", cls: "primary", value: "mine" }],
  });
  if (choice === "mine") {
    const mine = chunk.filter(({ f }) => paths.includes(f.path));
    const r = await api("save", { pid, force: true, files: mine.map(({ f, text }) => ({ path: f.path, content: text, enc: "utf8", baseV: 0 })) });
    for (const { f, text } of mine) { f.v = (r.files.find((x) => x.path === f.path) || {}).v || f.v + 1; f.data = text; f.dirty = getText(f) !== text; f.conflict = false; }
    S.rev = r.rev; toast("Your version was saved.", "ok");
  } else if (choice === "server") {
    const r = await api("get", { pid });
    for (const p of paths) {
      const sf = r.files.find((x) => x.path === p), lf = fileOf(p);
      if (!lf) continue;
      if (!sf) { S.files.delete(p); closeTab(p, true); continue; }
      S.muted = true; lf.data = sf.data; lf.v = sf.v; lf.cur = undefined; if (lf.doc) lf.doc.setValue(sf.data); if (plain && S.active === p) plain.value = sf.data; S.muted = false;
      lf.dirty = false; lf.conflict = false;
    }
    S.rev = r.meta.rev; renderAll(); schedulePreview(50); toast("Loaded the newer version.", "ok");
  }
}

// ───────────────────────────────────────── local backup (draft recovery after refresh / offline)
const bkKey = () => `webora:draft:${pid}`;
function scheduleBackup() { clearTimeout(backupTimer); backupTimer = setTimeout(persistBackup, 500); }
function persistBackup() {
  try {
    const out = {}; let size = 0;
    for (const f of S.files.values()) if (f.dirty && f.enc === "utf8") { const t = getText(f); size += t.length; out[f.path] = { text: t, v: f.v }; }
    if (!Object.keys(out).length) return localStorage.removeItem(bkKey());
    if (size > 3.5e6) return;
    localStorage.setItem(bkKey(), JSON.stringify({ t: Date.now(), files: out }));
  } catch (e) { /* storage unavailable — autosave to the server still works */ }
}
async function checkRecovery() {
  let b; try { b = JSON.parse(localStorage.getItem(bkKey()) || "null"); } catch (e) { b = null; }
  if (!b || !b.files) return;
  const diff = Object.entries(b.files).filter(([p, x]) => { const f = fileOf(p); return f && f.enc === "utf8" && f.data !== x.text; });
  if (!diff.length) { try { localStorage.removeItem(bkKey()); } catch (e) { /* ignore */ } return; }
  const ok = await modal({
    title: "Recover unsaved changes?",
    body: `<p>We found edits from ${new Date(b.t).toLocaleString()} that never reached the server (browser refreshed or connection lost):</p><div class="keybox">${diff.map(([p]) => esc(p)).join("<br>")}</div>`,
    actions: [{ label: "Discard", cls: "danger", value: "d" }, { label: "Recover", cls: "primary", value: "r" }],
  });
  if (ok === "r") {
    for (const [p, x] of diff) { const f = fileOf(p); f.v = x.v === f.v ? f.v : f.v; f.cur = x.text; if (f.doc) f.doc.setValue(x.text); f.dirty = true; if (!S.tabs.includes(p)) S.tabs.push(p); }
    S.muted = false; setSave("dirty"); scheduleSave(600); renderAll(); if (!S.active && diff[0]) activate(diff[0][0], { quiet: true });
    toast("Recovered — saving now.", "ok");
  } else try { localStorage.removeItem(bkKey()); } catch (e) { /* ignore */ }
}

// ───────────────────────────────────────── load / sync
async function syncFromServer({ discardLocal = false } = {}) {
  const r = await api("get", { pid });
  S.meta = r.meta; S.rev = r.meta.rev;
  const seen = new Set();
  for (const sf of r.files) {
    seen.add(sf.path);
    const lf = fileOf(sf.path);
    if (!lf) { S.files.set(sf.path, { ...sf, dirty: false }); continue; }
    if (lf.dirty && !discardLocal) continue; // keep local edits; a later save will surface any conflict
    lf.dir = sf.dir; lf.enc = sf.enc; lf.size = sf.size; lf.v = sf.v;
    if (lf.data !== sf.data || discardLocal) {
      S.muted = true; lf.data = sf.data; lf.cur = undefined; if (lf.doc) lf.doc.setValue(sf.data); if (plain && S.active === lf.path) plain.value = sf.data; S.muted = false;
    }
    lf.dirty = false;
  }
  for (const [p, lf] of [...S.files]) if (!seen.has(p) && (!lf.dirty || discardLocal)) { S.files.delete(p); closeTab(p, true); }
  renderAll(); schedulePreview(50); updatePubPill(); $("pname").value = S.meta.name; $("sbanner").style.display = "none";
}
function renderAll() { renderTree(); renderTabs(); updateFoot(); }

function updatePubPill() {
  const m = S.meta, p = $("pubPill"); if (!m || !p) return;
  if (m.siteKey) { p.className = "pill " + (m.hasUnpublished ? "draft" : "live"); p.textContent = m.hasUnpublished ? `Live v${m.publishedVersion} · unpublished changes` : `Live v${m.publishedVersion}`; }
  else { p.className = "pill draft"; p.textContent = "Draft · not published"; }
  const st = $("btnStats"); if (m.siteKey) { st.style.display = ""; st.href = `/analytics.html?key=${encodeURIComponent(m.siteKey)}`; } else st.style.display = "none";
}

// ───────────────────────────────────────── project search
function runSearch() {
  const q = $("sq").value, cs = $("sCase").classList.contains("on"), out = $("sres");
  if (q.length < 2) { out.innerHTML = '<div class="empty">Type at least 2 characters.</div>'; return; }
  const needle = cs ? q : q.toLowerCase(); let hits = 0, html = "";
  for (const f of [...S.files.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    if (f.dir || f.enc !== "utf8") continue;
    const lines = getText(f).split("\n"), found = [];
    for (let i = 0; i < lines.length && hits < 300; i++) {
      const hay = cs ? lines[i] : lines[i].toLowerCase(), at = hay.indexOf(needle);
      if (at >= 0) { hits++; const l = lines[i].trim().slice(0, 140); const j = (cs ? l : l.toLowerCase()).indexOf(needle); found.push(`<div class="sr-l" data-p="${esc(f.path)}" data-ln="${i + 1}"><span style="opacity:.5">${i + 1}</span>  ${j >= 0 ? esc(l.slice(0, j)) + "<mark>" + esc(l.slice(j, j + q.length)) + "</mark>" + esc(l.slice(j + q.length)) : esc(l)}</div>`); }
    }
    if (found.length) html += `<div class="sr-f"><span class="${colorOf(f.path)}">${icons.file}</span>${esc(f.path)} <span class="chip">${found.length}</span></div>${found.join("")}`;
  }
  out.innerHTML = html || '<div class="empty">No matches.</div>';
}
function setSide(which, focus) {
  S.side = which;
  $("sideFiles").style.display = which === "files" ? "flex" : "none"; $("sideSearch").style.display = which === "search" ? "flex" : "none";
  document.querySelectorAll(".side-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.st === which));
  if (!$("main").classList.contains("nosb") === false) toggleSide(true);
  if (which === "search" && focus) { setMobile("files"); $("sq").focus(); $("sq").select(); }
}
function toggleSide(force) { const on = force !== undefined ? force : $("main").classList.contains("nosb"); $("main").classList.toggle("nosb", !on); $("btnSide").classList.toggle("on", on); setTimeout(() => cm && cm.refresh(), 50); }
function setMobile(m) {
  S.mobile = m;
  $("pSide").classList.toggle("show", m === "files"); $("pEdit").classList.toggle("show", m === "code"); $("pPrev").classList.toggle("show", m === "preview");
  document.querySelectorAll("#mtabs button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
  if (m === "preview") schedulePreview(30); if (m === "code") setTimeout(() => cm && cm.refresh(), 30);
}

// ───────────────────────────────────────── uploads
async function uploadList(list, baseDir = "") {
  const arr = [...list]; if (!arr.length) return;
  const recs = [], skipped = [];
  for (const file of arr) {
    let rel = (file.webkitRelativePath || file.name);
    try {
      const path = U.normalizePath((baseDir ? baseDir + "/" : "") + rel);
      if (!U.isAllowed(path)) { skipped.push(`${rel} (type not allowed)`); continue; }
      if (file.size > U.LIMITS.maxFileBytes) { skipped.push(`${rel} (over 2.5 MB)`); continue; }
      recs.push(await U.readFileRecord(file, path));
    } catch (e) { skipped.push(`${rel} (${e.message})`); }
  }
  if (!recs.length) return toast(skipped.length ? "Nothing uploaded: " + skipped[0] : "Nothing to upload.", "err", 5000);
  const clash = recs.filter((r) => fileOf(r.path));
  let use = recs;
  if (clash.length) {
    const c = await modal({ title: "Files already exist", body: `<p>${clash.length} file(s) already exist in this project:</p><div class="keybox">${clash.slice(0, 8).map((r) => esc(r.path)).join("<br>")}${clash.length > 8 ? "<br>…" : ""}</div>`, actions: [{ label: "Cancel", value: null }, { label: "Skip existing", value: "skip" }, { label: "Replace them", cls: "primary", value: "replace" }] });
    if (!c) return;
    if (c === "skip") use = recs.filter((r) => !fileOf(r.path));
  }
  if (!use.length) return;
  await flushSaves();
  const base = {}; for (const r of use) { const f = fileOf(r.path); if (f && !f.dir) base[r.path] = f.v; }
  setSave("saving");
  const t = toastProgress(`Uploading ${use.length} file(s)…`);
  try { await uploadBatches(api, pid, use, (p) => t(p), base); t(1, true); await syncFromServer({ discardLocal: false }); toast(`Uploaded ${use.length} file(s)` + (skipped.length ? ` · skipped ${skipped.length}` : ""), "ok", 4500); if (skipped.length) console.warn("Skipped:", skipped); }
  catch (e) { t(1, true); toast("Upload failed: " + e.message, "err", 6000); await syncFromServer().catch(() => {}); }
  finally { setSave(anyDirty() ? "dirty" : "saved"); }
}
function toastProgress(msg) {
  const el = document.createElement("div"); el.className = "toast"; el.innerHTML = `<div style="width:100%">${esc(msg)}<div class="progress"><i></i></div></div>`;
  let box = $("toasts"); if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); } box.appendChild(el);
  return (p, done) => { el.querySelector("i").style.width = Math.round(p * 100) + "%"; if (done) setTimeout(() => el.remove(), 300); };
}

// ───────────────────────────────────────── versions
async function openVersions() {
  await flushSaves();
  const d = document.createElement("div"); d.className = "drawer-r";
  d.innerHTML = `<div class="dh"><span style="flex:1">Version history</span><button class="ib" data-x>${icons.x}</button></div><div class="db"><div class="field"><label>Create manual snapshot</label><div class="row" style="flex-wrap:nowrap"><input class="inp" id="snapLbl" placeholder="Label (optional)" maxlength="60"><button class="btn primary sm" id="snapBtn">${icons.save} Snapshot</button></div></div><div id="vlist"><div class="empty">Loading…</div></div></div>`;
  document.body.appendChild(d);
  const close = () => d.remove(); d.querySelector("[data-x]").onclick = close;
  let versions = [];
  const render = () => {
    d.querySelector("#vlist").innerHTML = versions.length ? versions.map((v) => {
      const kind = v.live ? '<span class="chip live">LIVE</span>' : v.kind === "publish" ? '<span class="chip">Published</span>' : v.kind === "manual" ? '<span class="chip warn">Snapshot</span>' : v.kind === "backup" ? '<span class="chip">Auto-backup</span>' : '<span class="chip">Imported</span>';
      return `<div class="ver ${v.live ? "live" : ""}" data-v="${v.vid}"><div class="vt"><b>v${v.n}</b>${kind}</div><small>${new Date(v.createdAt).toLocaleString()} · ${v.fileCount} files · ${U.fmtBytes(v.totalBytes)}${v.label ? " · " + esc(v.label) : ""}</small>
        <div class="row"><button class="btn sm outline" data-a="pv">${icons.eye} Preview</button><button class="btn sm outline" data-a="rs">${icons.history} Restore</button><button class="btn sm outline" data-a="dl">${icons.download} ZIP</button>${v.live ? "" : `<button class="btn sm danger" data-a="del">${icons.trash}</button>`}</div></div>`;
    }).join("") : '<div class="empty">No versions yet. One is created automatically every time you publish.</div>';
  };
  const load = async () => { try { versions = (await api("versions", { pid })).versions; render(); } catch (e) { d.querySelector("#vlist").innerHTML = `<div class="status show err">${esc(e.message)}</div>`; } };
  await load();
  d.querySelector("#snapBtn").onclick = async (e) => { e.target.disabled = true; try { await api("snapshot", { pid, label: d.querySelector("#snapLbl").value }); d.querySelector("#snapLbl").value = ""; toast("Snapshot created", "ok"); await load(); } catch (er) { toast(er.message, "err"); } e.target.disabled = false; };
  d.querySelector("#vlist").onclick = async (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const vid = b.closest("[data-v]").dataset.v, v = versions.find((x) => x.vid === vid);
    b.disabled = true;
    try {
      if (b.dataset.a === "pv") { const r = await api("getVersion", { pid, vid }); previewVersion(v, r.files); close(); }
      else if (b.dataset.a === "dl") { const r = await api("getVersion", { pid, vid }); await exportZip(r.files, `${S.meta.name}-v${v.n}`); }
      else if (b.dataset.a === "del") { if (await confirmBox("Delete version?", `v${v.n} will be permanently removed.`, "Delete", true)) { await api("deleteVersion", { pid, vid }); toast("Version deleted", "ok"); await load(); } }
      else if (b.dataset.a === "rs") { if (await confirmBox(`Restore v${v.n}?`, "This replaces your current DRAFT with this version (a backup of your draft is saved first). Your live website is NOT changed — review and publish separately.", "Restore to draft")) { await restoreVersion(vid); close(); } }
    } catch (er) { toast(er.message, "err"); }
    b.disabled = false;
  };
}
async function restoreVersion(vid) {
  await flushSaves();
  const r = await api("restore", { pid, vid });
  S.viewVersion = null; showVersionBanner();
  await syncFromServer({ discardLocal: true });
  try { localStorage.removeItem(bkKey()); } catch (e) { /* ignore */ }
  toast(`Restored v${r.restoredVersion} into your draft. Not published yet.`, "ok", 5000);
}
function previewVersion(v, files) {
  S.viewVersion = { v, map: new Map(files.filter((f) => !f.dir).map((f) => [f.path, f])) };
  showVersionBanner(); if (matchMedia("(max-width:1000px)").matches) setMobile("preview"); refreshPreviews();
}
function showVersionBanner() {
  document.querySelectorAll("[data-vb]").forEach((b) => {
    if (!S.viewVersion) { b.style.display = "none"; return; }
    const v = S.viewVersion.v; b.style.display = "flex";
    b.innerHTML = `<span>Previewing <b>v${v.n}</b> (${new Date(v.createdAt).toLocaleDateString()}) — read only</span><span class="sp"></span><button class="btn sm outline" data-bk>Back to draft</button><button class="btn sm warnbtn" data-rs>Restore this</button>`;
    b.querySelector("[data-bk]").onclick = () => { S.viewVersion = null; showVersionBanner(); refreshPreviews(); };
    b.querySelector("[data-rs]").onclick = async () => { if (await confirmBox(`Restore v${v.n}?`, "Replaces your draft (a backup is saved first). The live site is not changed.", "Restore to draft")) { try { await restoreVersion(v.vid); } catch (e) { toast(e.message, "err"); } } };
  });
}

// ───────────────────────────────────────── publish
async function publish() {
  await flushSaves();
  if (saveState === "failed") return toast("Fix the save error before publishing (your draft isn't fully saved).", "err", 5000);
  if (!fileOf("index.html")) return toast("Add an index.html file to the project root first.", "err");
  const m = S.meta, first = !m.siteKey;
  const body = first
    ? `<p>Your draft goes live at the address you choose. You can keep editing the draft afterwards — only <b style="color:#fff">Publish</b> updates the live site.</p>
       <div class="field"><label>Address</label><div class="combo"><input id="pAddr" maxlength="40" placeholder="my-website" value="${esc(m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 38))}"><select id="pSuf"><option value="none">/username</option>${SUFFIXES.map((s) => `<option value="${s}">.${s}</option>`).join("")}</select></div><small>The address can't be changed later.</small></div>
       <div class="field"><label>Site title</label><input id="pTitle" maxlength="150" value="${esc(m.name)}"></div>
       <div class="field"><label>Description (SEO)</label><input id="pDesc" maxlength="300" placeholder="A short description"></div>`
    : `<p>Publish your current draft to <b style="color:#fff">/${esc(m.sitePath)}</b>? A snapshot (v${(m.publishedVersion || 0) + 1}) is saved automatically, so you can roll back any time.</p>
       <div class="field"><label>Version note (optional)</label><input id="pNote" maxlength="80" placeholder="e.g. new pricing section"></div>`;
  await modal({
    title: first ? "Publish website" : "Publish changes", body: body + '<div class="status" id="pSt"></div>',
    actions: [{ label: "Cancel", value: null }, { label: first ? "Publish" : "Publish now", cls: "primary", keep: true, onClick: async (bg, done) => {
      const st = bg.querySelector("#pSt"), btn = bg.querySelector(".btn.primary"); btn.disabled = true;
      st.className = "status show info"; st.textContent = "Publishing…";
      try {
        const payload = first ? { path: (() => { const a = bg.querySelector("#pAddr").value.trim().toLowerCase(), s = bg.querySelector("#pSuf").value; return s === "none" ? a : `${a}.${s}`; })(), title: bg.querySelector("#pTitle").value.trim(), description: bg.querySelector("#pDesc").value.trim() } : { versionLabel: bg.querySelector("#pNote").value.trim() };
        const r = await api("publish", { pid, ...payload });
        await syncFromServer();
        done(true);
        toast(`Published v${r.version}!`, "ok", 6000);
        const open = await modal({ title: "Your website is live", body: `<p>It's published at:</p><div class="keybox"><a class="link" target="_blank" rel="noopener" href="${esc(r.url)}">${esc(r.url)}</a></div>`, actions: [{ label: "Close", value: false }, { label: "Open site", cls: "primary", value: true }] });
        if (open) window.open(r.url, "_blank", "noopener");
      } catch (e) { st.className = "status show err"; st.textContent = e.message; btn.disabled = false; }
    } }],
  });
}

// ───────────────────────────────────────── AI drawer
function openAI() {
  const d = document.createElement("div"); d.className = "drawer-r"; d.style.width = "min(560px,100vw)";
  d.innerHTML = `<div class="dh"><span style="flex:1">${icons.sparkle} AI Website Generator</span><button class="ib" data-x>${icons.x}</button></div>
    <div class="db"><div class="alert info" style="margin-bottom:14px"><b>Draft only</b><span>Generated files go into your draft (a backup snapshot is saved first). Nothing goes live until you press Publish.</span></div>
    <div class="field"><label>When applying</label><select class="inp" id="aiMode"><option value="merge">Add / overwrite only the generated files</option><option value="replace">Replace the whole project with the generated site</option></select></div>
    <div id="aiHost"></div></div>`;
  document.body.appendChild(d);
  d.querySelector("[data-x]").onclick = () => d.remove();
  mountAIGenerator(d.querySelector("#aiHost"), {
    applyLabel: "Apply to draft", allowModify: true,
    getExisting: () => [...S.files.values()].filter((f) => !f.dir && f.enc === "utf8").map((f) => ({ path: f.path, content: getText(f) })),
    onApply: async (files) => {
      const replace = d.querySelector("#aiMode").value === "replace";
      if (replace && !(await confirmBox("Replace the whole project?", "All current files are replaced by the generated site. A snapshot of your current draft is saved first so you can restore it.", "Replace", true))) return;
      await flushSaves();
      try { await api("snapshot", { pid, label: "Before AI changes" }); } catch (e) { /* empty project: nothing to back up */ }
      const incoming = new Set(files.map((f) => f.path));
      if (replace) {
        const del = [...S.files.keys()].filter((p) => !incoming.has(p) && ![...incoming].some((i) => i.startsWith(p + "/")));
        if (del.length) await api("save", { pid, deletes: del });
      }
      const base = {}; for (const f of files) { const ex = fileOf(f.path); if (ex && !ex.dir && !(replace && false)) base[f.path] = ex.v; }
      if (replace) await syncFromServer({ discardLocal: true });
      const base2 = {}; for (const f of files) { const ex = fileOf(f.path); if (ex && !ex.dir) base2[f.path] = ex.v; }
      await uploadBatches(api, pid, files, () => {}, base2);
      await syncFromServer({ discardLocal: true });
      openFile("index.html"); d.remove(); if (matchMedia("(max-width:1000px)").matches) setMobile("preview");
      toast("AI website added to your draft. Review the preview, then publish.", "ok", 6000);
    },
  });
}

function showShortcuts() {
  const rows = [["Ctrl / ⌘ + S", "Save now"], ["Ctrl + Space", "Auto-complete"], ["Ctrl + F", "Find"], ["Ctrl + H", "Find & replace"], ["Ctrl + Shift + F", "Search in project"], ["Shift + Alt + F", "Format code"], ["Ctrl + /", "Toggle comment"], ["Tab / Shift + Tab", "Indent / outdent"], ["Ctrl + Alt + [ / ]", "Fold / unfold all"], ["Ctrl + Enter", "Refresh preview"], ["Ctrl + B", "Toggle explorer"], ["Alt + W", "Close tab"]];
  modal({ title: "Keyboard shortcuts", body: `<table style="width:100%;font-size:13.5px">${rows.map(([k, v]) => `<tr><td style="padding:5px 0"><code class="chip">${k}</code></td><td style="color:var(--muted)">${v}</td></tr>`).join("")}</table>`, actions: [{ label: "Close", cls: "primary", value: true }] });
}

// ───────────────────────────────────────── wiring
function wire() {
  $("tree").addEventListener("click", (e) => {
    const row = e.target.closest(".tr"); if (!row) return;
    const p = row.dataset.p;
    if (e.target.closest("[data-more]")) { const r = e.target.closest("[data-more]").getBoundingClientRect(); S.sel = p; return openMenu(r.left - 150, r.bottom + 4, p); }
    if (row.dataset.k === "dir") { S.openDirs.has(p) ? S.openDirs.delete(p) : S.openDirs.add(p); S.sel = p; renderTree(); } else openFile(p);
  });
  $("tree").addEventListener("contextmenu", (e) => { const row = e.target.closest(".tr"); if (!row) return; e.preventDefault(); S.sel = row.dataset.p; openMenu(e.clientX, e.clientY, row.dataset.p); });
  // drag & drop upload
  const tree = $("tree");
  ["dragenter", "dragover"].forEach((n) => tree.addEventListener(n, (e) => { if ([...(e.dataTransfer.types || [])].includes("Files")) { e.preventDefault(); tree.classList.add("dropping"); } }));
  ["dragleave", "drop"].forEach((n) => tree.addEventListener(n, () => tree.classList.remove("dropping")));
  tree.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); const row = e.target.closest(".tr"); uploadList(e.dataTransfer.files, row ? targetDirOf(row.dataset.p) : ""); } });
  $("tabs").addEventListener("click", (e) => { const t = e.target.closest(".etab"); if (!t) return; if (e.target.closest("[data-x]")) closeTab(t.dataset.p); else activate(t.dataset.p); });
  $("tabs").addEventListener("auxclick", (e) => { const t = e.target.closest(".etab"); if (t && e.button === 1) closeTab(t.dataset.p); });
  $("aNewFile").onclick = () => newFile(targetDirOf(S.sel)).catch((e) => toast(e.message, "err"));
  $("aNewDir").onclick = () => newFolder(targetDirOf(S.sel)).catch((e) => toast(e.message, "err"));
  $("aUpFiles").onclick = () => { S.uploadDir = targetDirOf(S.sel); $("inFiles").click(); };
  $("aUpDir").onclick = () => { S.uploadDir = targetDirOf(S.sel); $("inDir").click(); };
  $("inFiles").onchange = (e) => { uploadList(e.target.files, S.uploadDir || ""); e.target.value = ""; };
  $("inDir").onchange = (e) => { uploadList(e.target.files, S.uploadDir || ""); e.target.value = ""; };
  document.querySelectorAll(".side-tabs button").forEach((b) => (b.onclick = () => setSide(b.dataset.st, true)));
  let st; $("sq").oninput = () => { clearTimeout(st); st = setTimeout(runSearch, 250); };
  $("sCase").onclick = () => { $("sCase").classList.toggle("on"); runSearch(); };
  $("sres").addEventListener("click", (e) => { const l = e.target.closest(".sr-l"); if (l) openFile(l.dataset.p, { line: +l.dataset.ln }); });
  $("eFind").onclick = () => cm && cm.execCommand("find"); $("eRepl").onclick = () => cm && cm.execCommand("replace");
  $("eFmt").onclick = formatActive; $("eSave").onclick = () => saveNow(true);
  let folded = false; $("eFold").onclick = () => { if (!cm) return; cm.execCommand(folded ? "unfoldAll" : "foldAll"); folded = !folded; };
  $("btnSide").onclick = () => toggleSide(); $("btnSide").classList.add("on");
  $("btnAI").onclick = openAI; $("btnVer").onclick = () => openVersions().catch((e) => toast(e.message, "err"));
  $("btnPub").onclick = () => publish().catch((e) => toast(e.message, "err"));
  $("btnZip").onclick = async () => { try { await flushSaves(); const list = [...S.files.values()].map((f) => ({ path: f.path, dir: f.dir, enc: f.enc, data: f.dir ? "" : f.enc === "utf8" ? getText(f) : f.data })); if (!list.some((f) => !f.dir)) return toast("The project is empty.", "info"); await exportZip(list, S.meta.name); toast("ZIP downloaded", "ok"); } catch (e) { toast(e.message, "err"); } };
  $("pname").onchange = async () => { const n = $("pname").value.trim(); if (!n || n === S.meta.name) { $("pname").value = S.meta.name; return; } try { const r = await api("rename", { pid, name: n }); S.meta.name = r.name; $("pname").value = r.name; document.title = r.name + " — Studio"; toast("Renamed", "ok"); } catch (e) { toast(e.message, "err"); $("pname").value = S.meta.name; } };
  $("pname").onkeydown = (e) => { if (e.key === "Enter") e.target.blur(); };
  document.querySelectorAll("#mtabs button").forEach((b) => (b.onclick = () => setMobile(b.dataset.m)));
  $("pPrev").querySelector("[data-full]").onclick = openFullscreen;
  $("fHint").onclick = showShortcuts;
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === "s") { e.preventDefault(); saveNow(true); }
    else if (mod && e.shiftKey && k === "f") { e.preventDefault(); setSide("search", true); }
    else if (mod && k === "b") { e.preventDefault(); toggleSide(); }
    else if (mod && k === "enter") { e.preventDefault(); refreshPreviews(); }
    else if (e.altKey && k === "w") { e.preventDefault(); if (S.active) closeTab(S.active); }
  }, true);
  addEventListener("beforeunload", (e) => { if (anyDirty() || saveState === "saving" || saveState === "failed") { persistBackup(); e.preventDefault(); e.returnValue = ""; } });
  addEventListener("online", () => { toast("Back online — saving…", "ok"); saveNow(false); });
  addEventListener("offline", () => toast("You're offline. Edits are kept and will save when you reconnect.", "info", 5000));
  document.addEventListener("visibilitychange", () => { if (document.hidden) { if (anyDirty()) saveNow(false); persistBackup(); } else checkHead(); });
  headTimer = setInterval(checkHead, 45000);
}
async function checkHead() {
  if (document.hidden || saveState === "saving") return;
  try {
    const h = await api("head", { pid });
    if (h.rev > S.rev) {
      const b = $("sbanner"); b.style.display = "flex";
      b.innerHTML = `<span>This project was changed in another tab or device.</span><button class="btn sm outline" id="sbReload">Load changes</button>`;
      $("sbReload").onclick = async () => { try { await syncFromServer(); toast("Loaded the latest changes" + (anyDirty() ? " (your unsaved edits were kept)" : ""), "ok"); } catch (e) { toast(e.message, "err"); } };
    }
  } catch (e) { /* offline: ignore */ }
}

// ───────────────────────────────────────── boot
onAuthStateChanged(auth, async (u) => {
  if (!u) return (location.href = "/login.html?next=" + encodeURIComponent(location.pathname + location.search));
  if (!pid) return (location.href = "/dashboard.html");
  if (S.booted) return; S.booted = true;
  try {
    buildUI(); initEditor(); wire(); initFx({ background: false });
    const r = await api("get", { pid });
    S.meta = r.meta; S.rev = r.meta.rev;
    for (const f of r.files) S.files.set(f.path, { ...f, dirty: false });
    document.title = r.meta.name + " — Studio"; $("pname").value = r.meta.name;
    for (const p of S.files.keys()) { const parts = p.split("/"); if (parts.length > 1) S.openDirs.add(parts[0]); }
    mainPreview = makePreview($("pPrev"));
    setMobile(matchMedia("(max-width:1000px)").matches ? "code" : "code");
    renderAll(); updatePubPill();
    const first = fileOf("index.html") || [...S.files.values()].find((f) => !f.dir && f.enc === "utf8");
    if (first) activate(first.path, { quiet: true }); else $("welcome").style.display = "grid";
    mainPreview.render();
    hideLoader();
    await checkRecovery();
  } catch (e) {
    hideLoader();
    $("app").innerHTML = `<div class="wrap narrow"><div class="card"><div class="card-b"><h1>Couldn't open project</h1><div class="status show err">${esc(e.message)}</div><div class="row" style="margin-top:14px"><a class="btn primary" href="/dashboard.html">Back to dashboard</a><button class="btn outline" onclick="location.reload()">Retry</button></div></div></div></div>`;
    document.body.classList.remove("studio"); document.body.style.overflow = "auto";
  }
});
window.__studio = { S, saveNow, getText };
