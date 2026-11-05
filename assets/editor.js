// Shared editor used by create.html (mode "create") and edit.html (mode "update").
import { auth, db, ref, get, onAuthStateChanged, signOut } from "/assets/firebase-client.js";
import { mountHeader, setAvatar, hideLoader, icons, $, status } from "/assets/layout.js";

export function initEditor(mode) {
  const editKey = new URLSearchParams(location.search).get("key");
  const isEdit = mode === "update";
  let user = null;

  mountHeader("app", async () => { await signOut(auth); location.href = "/"; });
  $("root").innerHTML = `
  <div class="eyebrow">${isEdit ? "Manage" : "New"}</div>
  <h1>${isEdit ? "Edit website" : "Create website"}</h1>
  <div class="edgrid">
   <div class="card"><div class="card-b">
    <div class="field"><label>Website title</label><input id="title" maxlength="150" placeholder="My awesome website"></div>
    <div class="field"><label>Description</label><input id="description" maxlength="300" placeholder="A short description"></div>
    <div class="field"><label>Address</label>
     <div class="combo"><input id="username" maxlength="40" placeholder="my-website">
      <select id="suffix"><option value="none">/username</option><option value="webora.app">.webora.app</option><option value="webora.online">.webora.online</option><option value="webora.site">.webora.site</option></select></div>
     <small id="lockHint" style="display:none">The address can't be changed after a site is created.</small></div>
    <div class="tabs"><div class="tab active" id="tabCode">Write code</div><div class="tab" id="tabUpload">Upload index.html</div></div>
    <div id="codePane">
     <div class="field"><label>HTML</label><textarea id="html" placeholder="<h1>Hello Webora!</h1>"></textarea></div>
     <div class="field"><label>CSS</label><textarea id="css"></textarea></div>
     <div class="field"><label>JavaScript</label><textarea id="js"></textarea></div></div>
    <div id="uploadPane" style="display:none"><div class="field"><label>index.html file</label><input type="file" id="fileInput" accept=".html,text/html"><small>Single-file sites only — inline your CSS/JS.</small></div></div>
    <div class="row"><button class="btn outline" id="previewBtn">Preview</button>
     <button class="btn primary" id="publishBtn">${isEdit ? "Save changes" : "Publish website"}</button>
     <button class="btn danger" id="deleteBtn" style="display:${isEdit ? "inline-flex" : "none"}">Delete</button></div>
    <div id="pubStatus" class="status"></div>
   </div></div>
   <div class="card"><div class="card-h">Live preview</div><div class="card-b"><iframe id="preview" class="preview" title="Preview" sandbox="allow-scripts allow-forms allow-popups"></iframe></div></div>
  </div>`;

  const val = (id) => $(id).value;
  const buildPath = () => { const u = val("username").trim().toLowerCase(), s = val("suffix"); return s === "none" ? u : `${u}.${s}`; };

  function preview() {
    let h = val("html").trim() || "<html><body><h1>Hello Webora</h1></body></html>";
    const css = val("css").replace(/<\/style/gi, "<\\/style"), js = val("js").replace(/<\/script/gi, "<\\/script");
    h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, (m) => m + `<style>${css}</style>`) : `<head><style>${css}</style></head>` + h;
    const s = `<script>${js}<\/script>`;
    $("preview").srcdoc = /<\/body>/i.test(h) ? h.replace(/<\/body>/i, s + "</body>") : h + s;
  }
  $("previewBtn").onclick = preview;
  const tab = (on) => {
    $("tabCode").classList.toggle("active", on === "code"); $("tabUpload").classList.toggle("active", on === "up");
    $("codePane").style.display = on === "code" ? "block" : "none"; $("uploadPane").style.display = on === "up" ? "block" : "none";
  };
  $("tabCode").onclick = () => tab("code"); $("tabUpload").onclick = () => tab("up");
  $("fileInput").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $("html").value = await f.text(); $("css").value = ""; $("js").value = ""; tab("code"); preview();
  };

  async function loadExisting() {
    const snap = await get(ref(db, `sitesPublic/${editKey}`));
    if (!snap.exists()) return status("pubStatus", "Website not found.", "err");
    const s = snap.val();
    if (s.ownerUid !== user.uid) return status("pubStatus", "You don't own this website.", "err");
    $("title").value = s.title || ""; $("description").value = s.description || "";
    $("html").value = s.html || ""; $("css").value = s.css || ""; $("js").value = s.js || "";
    const p = s.path || "", d = p.indexOf(".");
    $("username").value = d === -1 ? p : p.slice(0, d); $("suffix").value = d === -1 ? "none" : p.slice(d + 1);
    $("username").disabled = $("suffix").disabled = true; $("lockHint").style.display = "block";
  }

  onAuthStateChanged(auth, async (u) => {
    if (!u) return (location.href = "/login.html?next=" + encodeURIComponent(location.pathname + location.search));
    user = u; setAvatar(u);
    if (isEdit) { if (!editKey) return (location.href = "/dashboard.html"); await loadExisting(); }
    hideLoader(); preview();
  });

  async function call(method, body) {
    const res = await fetch("/api/publish", { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await user.getIdToken()) }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Request failed.");
    return j;
  }
  $("publishBtn").onclick = async () => {
    const path = buildPath();
    if (!path) return status("pubStatus", "Give your website an address.", "err");
    if (!val("title").trim() || !val("html").trim()) return status("pubStatus", "Title and HTML are required.", "err");
    $("publishBtn").disabled = true; status("pubStatus", "Publishing…");
    try {
      const j = await call("POST", { title: val("title").trim(), description: val("description").trim(), html: val("html"), css: val("css"), js: val("js"), path, mode });
      status("pubStatus", "Published! " + j.url, "ok");
      if (!isEdit) setTimeout(() => (location.href = "/dashboard.html"), 1200);
    } catch (e) { status("pubStatus", e.message, "err"); }
    finally { $("publishBtn").disabled = false; }
  };
  $("deleteBtn").onclick = async () => {
    if (!confirm("Delete this website permanently?")) return;
    try { await call("DELETE", { path: buildPath() }); location.href = "/dashboard.html"; }
    catch (e) { status("pubStatus", e.message, "err"); }
  };
}
