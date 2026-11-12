// Images page — upload an image, get a masked direct link (served from our own
// domain, never revealing the real storage host), and manage upload history.
import { mountHeader, setAvatar, hideLoader, icons, esc, $, toast, modal, confirmBox, miniLoader } from "/assets/layout.js";
import { auth, onAuthStateChanged, signOut } from "/assets/firebase-client.js";
import { imageUpload, imageList, imageDelete } from "/assets/api.js";
import { bytesToBase64, fmtBytes } from "/assets/fileutil.js";

mountHeader("app", async () => { await signOut(auth); location.href = "/"; });

let images = [];
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_BYTES = 3 * 1024 * 1024;
const when = (t) => (t ? new Date(t).toLocaleString() : "—");

$("root").innerHTML = `
  <div class="eyebrow">Workspace</div><h1>Images</h1>
  <p class="sub" style="margin-bottom:16px">Upload an image and get a direct link on your own domain — it's served straight from Webora, with no sign that it's hosted anywhere else.</p>
  <div class="row" style="margin-bottom:18px">
    <button class="btn primary" id="btnUp">${icons.upload} Upload image</button>
    <input type="file" id="inUp" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
  </div>
  <div class="sub" id="count" style="margin-bottom:6px"></div>
  <div class="tiles" id="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))"></div>
`;

function card(img, i) {
  const dead = img.deleted;
  return `
  <div class="card reveal" style="--d:${i * 0.05}s;margin-bottom:0;display:flex;flex-direction:column">
    <div style="aspect-ratio:4/3;background:var(--soft);display:flex;align-items:center;justify-content:center;overflow:hidden">
      ${dead ? `<span style="color:var(--muted);font-size:12px">${icons.warn} Deleted</span>` : `<img src="${esc(img.url)}" loading="lazy" alt="${esc(img.name)}" style="width:100%;height:100%;object-fit:cover">`}
    </div>
    <div style="padding:12px 14px;display:flex;flex-direction:column;gap:8px;flex:1">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <b style="font-size:13px;word-break:break-word;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(img.name)}">${esc(img.name)}.${esc(img.ext)}</b>
        <span class="chip ${dead ? "" : "live"}">${dead ? "Deleted" : "Live"}</span>
      </div>
      <div style="color:var(--muted);font-size:12px">${fmtBytes(img.size)} · ${when(img.createdAt)}</div>
      ${dead ? "" : `<input readonly value="${esc(img.url)}" class="inp" style="font-size:11px;padding:7px 9px" onclick="this.select()">`}
      <div class="row" style="gap:6px;margin-top:auto">
        ${dead ? "" : `<button class="btn sm outline" data-copy="${esc(img.url)}" style="flex:1">${icons.copy} Copy</button>
        <a class="btn sm outline" href="${esc(img.url)}" target="_blank" rel="noopener" style="flex:1">${icons.ext} Open</a>`}
        ${dead ? "" : `<button class="btn sm danger" data-del="${img.id}" title="Delete">${icons.trash}</button>`}
      </div>
    </div>
  </div>`;
}

function render() {
  $("count").textContent = images.length ? `${images.length} image${images.length === 1 ? "" : "s"} uploaded` : "";
  $("grid").innerHTML = images.length
    ? images.map((img, i) => card(img, i)).join("")
    : `<div class="empty" style="grid-column:1/-1">No images yet — click “Upload image” to get your first direct link.</div>`;
}

async function doUpload(file) {
  if (!ALLOWED.includes(file.type)) return toast("Only PNG, JPG, GIF or WEBP images are allowed.", "err");
  if (file.size > MAX_BYTES) return toast("Image is larger than 3 MB.", "err");
  const btn = $("btnUp"); btn.disabled = true; btn.innerHTML = `${icons.spinner} Uploading…`;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const data = bytesToBase64(buf);
    const name = file.name.replace(/\.[a-z0-9]+$/i, "");
    const r = await imageUpload(name, data);
    images.unshift({ id: r.id, name: r.name, ext: (r.url.split(".").pop() || ""), size: r.size, url: r.url, createdAt: Date.now(), deleted: false });
    render();
    await modal({
      title: "Image uploaded",
      body: `<p>Your direct link is ready — it loads straight from your own domain.</p><div class="field"><input readonly id="__u" value="${esc(r.url)}" onclick="this.select()"></div>`,
      actions: [{ label: "Copy link", cls: "primary", keep: true, onClick: async (bg, done) => { await copy(r.url); done(true); } }, { label: "Close", value: true }],
    });
  } catch (e) { toast(e.message, "err"); }
  finally { btn.disabled = false; btn.innerHTML = `${icons.upload} Upload image`; }
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Link copied", "ok"); }
  catch (e) { toast("Couldn't copy — select and copy manually.", "err"); }
}

$("btnUp").onclick = () => $("inUp").click();
$("inUp").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) doUpload(f); };
$("grid").addEventListener("click", async (e) => {
  const c = e.target.closest("[data-copy]"), d = e.target.closest("[data-del]");
  if (c) return copy(c.dataset.copy);
  if (d) {
    const img = images.find((x) => x.id === d.dataset.del);
    if (!(await confirmBox("Delete image?", `"${img ? img.name : "This image"}" will stop loading everywhere it's linked. This can't be undone.`, "Delete", true))) return;
    d.disabled = true;
    try { await imageDelete(d.dataset.del); const it = images.find((x) => x.id === d.dataset.del); if (it) it.deleted = true; render(); toast("Image deleted", "ok"); }
    catch (er) { toast(er.message, "err"); d.disabled = false; }
  }
});

onAuthStateChanged(auth, async (u) => {
  if (!u) return (location.href = "/auth/login?next=/app/images");
  setAvatar(u);
  $("grid").innerHTML = miniLoader("Loading your images…");
  try { const r = await imageList(); images = r.images; render(); }
  catch (e) { $("grid").innerHTML = `<div class="status show err">${esc(e.message)}</div>`; }
  hideLoader();
});
