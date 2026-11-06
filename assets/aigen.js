// Shared AI Website Generator panel (used by ai.html and by Studio's AI drawer).
// Talks only to /api/ai — the API key never reaches the browser.
import { aiGenerate } from "/assets/api.js";
import { buildPreview } from "/assets/preview.js";
import { esc, icons, toast } from "/assets/layout.js";

const EXAMPLES = [
  "Create a professional modern portfolio website with a white and blue theme, responsive layout, animations, and contact section.",
  "A dark-mode landing page for a mobile app with pricing table, FAQ accordion and animated hero.",
  "A restaurant website with menu page, gallery, opening hours and a reservation form UI.",
];
const STAGES = ["Understanding your idea…", "Designing the layout & colors…", "Writing HTML structure…", "Styling with CSS & animations…", "Adding JavaScript interactions…", "Validating files & links…"];

export function mountAIGenerator(host, { applyLabel = "Send to editor", getExisting = null, onApply, allowModify = false } = {}) {
  let files = null, summary = "", timer = null, lastPrompt = "", active = null;
  host.innerHTML = `
    <div class="field"><label>Describe your website</label>
      <textarea class="ai-prompt" maxlength="4000" style="height:120px;font:14px/1.5 Inter,sans-serif" placeholder="${esc(EXAMPLES[0])}"></textarea>
      <small class="ai-count">0 / 4000</small></div>
    <div class="row ai-ex" style="margin-bottom:12px">${EXAMPLES.map((e, i) => `<button type="button" class="btn sm outline" data-ex="${i}" style="text-transform:none;letter-spacing:0;font-family:Inter">${esc(e.split(/[,.]/)[0].slice(0, 34))}…</button>`).join("")}</div>
    ${allowModify ? `<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:12px;color:var(--muted)"><input type="checkbox" class="ai-mod"> Modify my current project files instead of starting fresh</label>` : ""}
    <button class="btn primary block ai-go">${icons.sparkle} Generate Website</button>
    <div class="ai-prog" style="display:none;text-align:center;padding:22px 8px">
      <div style="width:90px;margin:0 auto 10px">${window.WeboraLogo ? window.WeboraLogo("anim") : ""}</div>
      <div class="loader-text ai-stage">Starting…</div><div class="progress"><i class="ai-bar"></i></div>
      <small class="ai-time" style="color:var(--muted)"></small></div>
    <div class="status ai-err"></div>
    <div class="ai-res" style="display:none">
      <div class="alert info" style="margin:14px 0 10px"><b>${icons.check} Website generated</b><span class="ai-sum"></span></div>
      <div class="row ai-files" style="margin-bottom:8px"></div>
      <div class="card" style="margin:0 0 10px"><div class="card-h"><span>Preview</span><button class="btn sm outline ai-refresh">${icons.refresh}</button></div>
        <iframe class="ai-frame" sandbox="allow-scripts allow-forms allow-popups allow-modals" style="width:100%;height:340px;border:0;background:#fff;display:block" title="Generated preview"></iframe></div>
      <details class="ai-edit" style="margin-bottom:12px"><summary style="cursor:pointer;color:#9db8ff;font-weight:700;margin-bottom:8px">Edit generated code</summary>
        <select class="inp ai-sel" style="margin-bottom:8px"></select><textarea class="inp ai-code" style="height:220px;font:12.5px/1.5 ui-monospace,monospace;white-space:pre;resize:vertical"></textarea></details>
      <div class="row"><button class="btn primary ai-apply">${icons.code} ${esc(applyLabel)}</button><button class="btn outline ai-retry">${icons.refresh} Regenerate</button></div>
    </div>`;
  const q = (s) => host.querySelector(s);
  const prompt = q(".ai-prompt");
  prompt.oninput = () => (q(".ai-count").textContent = `${prompt.value.length} / 4000`);
  host.querySelectorAll("[data-ex]").forEach((b) => (b.onclick = () => { prompt.value = EXAMPLES[b.dataset.ex]; prompt.oninput(); prompt.focus(); }));

  const showErr = (m, retry = true) => { const e = q(".ai-err"); e.className = "status show err ai-err"; e.innerHTML = `${esc(m)}${retry ? ` <button class="btn sm outline" style="margin-left:8px" data-retry>${icons.refresh} Retry</button>` : ""}`; const r = e.querySelector("[data-retry]"); if (r) r.onclick = () => go(lastPrompt); };
  const render = () => {
    const sel = q(".ai-sel"); const cur = sel.value;
    sel.innerHTML = files.map((f) => `<option>${esc(f.path)}</option>`).join(""); if (cur && files.some((f) => f.path === cur)) sel.value = cur;
    active = files.find((f) => f.path === sel.value) || files[0]; q(".ai-code").value = active.content;
    q(".ai-files").innerHTML = files.map((f) => `<span class="chip">${esc(f.path)}</span>`).join("");
    preview();
  };
  const preview = () => {
    const map = new Map(files.map((f) => [f.path, { path: f.path, enc: "utf8", data: f.content }]));
    q(".ai-frame").srcdoc = buildPreview(map, "index.html").html;
  };
  q(".ai-sel").onchange = () => { active = files.find((f) => f.path === q(".ai-sel").value); q(".ai-code").value = active.content; };
  let t; q(".ai-code").oninput = () => { active.content = q(".ai-code").value; clearTimeout(t); t = setTimeout(preview, 500); };
  q(".ai-refresh").onclick = preview;

  async function go(text) {
    text = (text || "").trim();
    if (text.length < 8) return showErr("Describe the website you want (at least a few words).", false);
    lastPrompt = text;
    q(".ai-err").className = "status ai-err"; q(".ai-res").style.display = "none";
    q(".ai-go").disabled = true; q(".ai-go").style.display = "none"; q(".ai-prog").style.display = "block";
    const t0 = Date.now(); let i = 0;
    const tick = () => { const s = (Date.now() - t0) / 1000; i = Math.min(STAGES.length - 1, Math.floor(s / 5)); q(".ai-stage").textContent = STAGES[i]; q(".ai-bar").style.width = Math.min(94, 100 * (1 - Math.exp(-s / 22))) + "%"; q(".ai-time").textContent = `${Math.floor(s)}s elapsed`; };
    tick(); timer = setInterval(tick, 500);
    try {
      const existing = allowModify && q(".ai-mod") && q(".ai-mod").checked && getExisting ? getExisting() : undefined;
      const r = await aiGenerate(text, existing);
      files = r.files; summary = r.summary || "";
      q(".ai-bar").style.width = "100%";
      q(".ai-sum").textContent = summary || `${files.length} files ready — review the preview, tweak the code if you like, then send it to the editor. Nothing is published until you press Publish.`;
      q(".ai-res").style.display = "block"; render();
    } catch (e) { showErr(e.message, true); }
    finally { clearInterval(timer); q(".ai-prog").style.display = "none"; q(".ai-go").style.display = ""; q(".ai-go").disabled = false; }
  }
  q(".ai-go").onclick = () => go(prompt.value);
  q(".ai-retry").onclick = () => go(lastPrompt || prompt.value);
  q(".ai-apply").onclick = async () => {
    const b = q(".ai-apply"); b.disabled = true;
    try { await onApply(files.map((f) => ({ path: f.path, enc: "utf8", data: f.content })), summary); }
    catch (e) { toast(e.message, "err"); }
    finally { b.disabled = false; }
  };
  return { destroy: () => clearInterval(timer) };
}
