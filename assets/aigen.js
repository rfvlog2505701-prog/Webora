// Shared AI Website Generator panel (used by ai.html and by Studio's AI drawer).
// Talks only to /api/ai — the API key never reaches the browser.
// Uses the streaming endpoint so files appear live as the model writes them,
// with a real elapsed/ETA readout instead of a fake animated timer — and
// falls back to the old one-shot request if streaming isn't available.
import { aiGenerate, aiGenerateStream } from "/assets/api.js";
import { buildPreview } from "/assets/preview.js";
import { esc, icons, toast } from "/assets/layout.js";

const EXAMPLES = [
  "Create a professional modern portfolio website with a white and blue theme, responsive layout, animations, and contact section.",
  "A dark-mode landing page for a mobile app with pricing table, FAQ accordion and animated hero.",
  "A restaurant website with menu page, gallery, opening hours and a reservation form UI.",
];

const EXT_COLOR = { html: "#fb923c", htm: "#fb923c", css: "#60a5fa", js: "#facc15", mjs: "#facc15", json: "#34d399", svg: "#c084fc", md: "#9fb0d8" };
const extOf = (p) => (p.split(".").pop() || "").toLowerCase();
const colorFor = (p) => EXT_COLOR[extOf(p)] || "#9fb0d8";

// Pulls out every COMPLETE {"path":"...","content":"..."} object from the
// accumulated JSON text so far, plus the "summary" field if present — this
// is what fixes the old "can't tell HTML apart from plain text / thinking"
// problem: files and the human-readable summary are always parsed as two
// separate, well-defined things, never guessed from raw text.
function decodeJsonString(raw) {
  try { return JSON.parse('"' + raw + '"'); } catch (e) { return raw; }
}
const FILE_RE = /"path"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"content"\s*:\s*"((?:\\.|[^"\\])*)"/g;
const SUMMARY_RE = /"summary"\s*:\s*"((?:\\.|[^"\\])*)"/;
function parsePartial(text) {
  const files = [];
  FILE_RE.lastIndex = 0;
  let m;
  while ((m = FILE_RE.exec(text))) files.push({ path: decodeJsonString(m[1]), content: decodeJsonString(m[2]) });
  const sm = SUMMARY_RE.exec(text);
  return { files, summary: sm ? decodeJsonString(sm[1]) : "" };
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export function mountAIGenerator(host, { applyLabel = "Send to editor", getExisting = null, onApply, allowModify = false } = {}) {
  let files = null, summary = "", lastPrompt = "", active = null, elTimer = null, refImage = null;
  host.innerHTML = `
    <div class="field"><label>Describe your website</label>
      <textarea class="ai-prompt" maxlength="4000" style="height:120px;font:14px/1.5 Inter,sans-serif" placeholder="${esc(EXAMPLES[0])}"></textarea>
      <small class="ai-count">0 / 4000</small></div>
    <div class="row ai-ex" style="margin-bottom:12px">${EXAMPLES.map((e, i) => `<button type="button" class="btn sm outline" data-ex="${i}" style="text-transform:none;letter-spacing:0;font-family:Inter">${esc(e.split(/[,.]/)[0].slice(0, 34))}…</button>`).join("")}</div>
    <div class="field">
      <label>Reference image <span style="font-weight:400;color:var(--muted);text-transform:none;letter-spacing:0">(optional — a screenshot, logo or mockup to guide the look)</span></label>
      <div class="ai-imgwrap" style="display:none;position:relative;width:120px;margin-bottom:8px">
        <img class="ai-imgprev" alt="Reference" style="width:120px;height:90px;object-fit:cover;border-radius:10px;border:1px solid var(--line);display:block">
        <button type="button" class="ib ai-imgdel" title="Remove image" style="position:absolute;top:-8px;right:-8px;background:var(--surface);border:1px solid var(--line);width:26px;height:26px">${icons.x}</button>
      </div>
      <button type="button" class="btn sm outline ai-imgbtn">${icons.upload} Attach image</button>
      <input type="file" class="ai-imgfile" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
      <small>Used only as visual/style guidance — it is never saved as a file in your project.</small>
    </div>
    ${allowModify ? `<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:12px;color:var(--muted)"><input type="checkbox" class="ai-mod"> Modify my current project files instead of starting fresh</label>` : ""}
    <button class="btn primary block ai-go">${icons.sparkle} Generate Website</button>
    <div class="ai-prog" style="display:none;padding:18px 4px">
      <div class="row" style="align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:46px;flex:none">${window.WeboraLogo ? window.WeboraLogo("anim") : ""}</div>
        <div style="flex:1;min-width:0">
          <div class="loader-text ai-stage" style="text-align:left;white-space:normal">Connecting to the AI…</div>
          <div class="progress"><i class="ai-bar"></i></div>
        </div>
      </div>
      <div class="row" style="justify-content:space-between;font-size:11.5px;color:var(--muted);margin-bottom:10px">
        <span class="ai-time">0s elapsed</span><span class="ai-eta"></span>
      </div>
      <div class="ai-analysis" style="display:none;background:rgba(61,107,255,.08);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:12.5px;color:#cdd8ff;max-height:70px;overflow:auto"></div>
      <div class="row ai-chips" style="gap:6px;flex-wrap:wrap"></div>
    </div>
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

  // ── reference image attach/remove
  const imgFile = q(".ai-imgfile"), imgWrap = q(".ai-imgwrap"), imgPrev = q(".ai-imgprev");
  q(".ai-imgbtn").onclick = () => imgFile.click();
  q(".ai-imgdel").onclick = () => { refImage = null; imgFile.value = ""; imgWrap.style.display = "none"; };
  imgFile.onchange = () => {
    const f = imgFile.files && imgFile.files[0];
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(f.type)) { toast("Use a PNG, JPEG, WEBP or GIF image.", "err"); imgFile.value = ""; return; }
    if (f.size > MAX_IMAGE_BYTES) { toast("Image is too large (max ~6MB).", "err"); imgFile.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const comma = dataUrl.indexOf(",");
      refImage = { mimeType: f.type, data: comma >= 0 ? dataUrl.slice(comma + 1) : "" };
      imgPrev.src = dataUrl; imgWrap.style.display = "block";
    };
    reader.onerror = () => toast("Couldn't read that image.", "err");
    reader.readAsDataURL(f);
  };

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

  // Expected total output size, used only to show a rough ETA — it's a
  // heuristic, not a promise, and is labelled "~" accordingly.
  const EXPECTED_CHARS = 26000;
  function tickTimers(t0, receivedChars) {
    const s = (Date.now() - t0) / 1000;
    q(".ai-time").textContent = `${Math.floor(s)}s elapsed`;
    const frac = Math.max(0.03, Math.min(0.96, receivedChars / EXPECTED_CHARS));
    q(".ai-bar").style.width = Math.round(frac * 100) + "%";
    if (receivedChars > 400 && s > 2) {
      const rate = receivedChars / s;
      const remainingChars = Math.max(0, EXPECTED_CHARS - receivedChars);
      const etaS = Math.round(remainingChars / Math.max(rate, 1));
      q(".ai-eta").textContent = frac > 0.9 ? "almost done…" : `~${etaS}s remaining`;
    } else {
      q(".ai-eta").textContent = "";
    }
  }

  async function go(text) {
    text = (text || "").trim();
    if (text.length < 8) return showErr("Describe the website you want (at least a few words).", false);
    lastPrompt = text;
    q(".ai-err").className = "status ai-err"; q(".ai-res").style.display = "none";
    q(".ai-go").disabled = true; q(".ai-go").style.display = "none"; q(".ai-prog").style.display = "block";
    q(".ai-chips").innerHTML = ""; q(".ai-analysis").style.display = "none"; q(".ai-analysis").textContent = "";
    const seenPaths = new Set();
    const t0 = Date.now();
    clearInterval(elTimer);
    let lastReceived = 0;
    elTimer = setInterval(() => tickTimers(t0, lastReceived), 400);
    try {
      const existing = allowModify && q(".ai-mod") && q(".ai-mod").checked && getExisting ? getExisting() : undefined;
      let result;
      try {
        result = await aiGenerateStream(text, existing, (evt) => {
          if (evt.type === "delta") {
            lastReceived = evt.total || lastReceived;
            const partial = parsePartial(evt.full || "");
            if (partial.summary) {
              const a = q(".ai-analysis"); a.style.display = "block"; a.textContent = partial.summary;
            }
            for (const f of partial.files) {
              if (seenPaths.has(f.path)) continue;
              seenPaths.add(f.path);
              q(".ai-stage").textContent = `Writing ${f.path}…`;
              const chip = document.createElement("span");
              chip.className = "chip"; chip.style.cssText = `border-color:${colorFor(f.path)};color:${colorFor(f.path)}`;
              chip.textContent = "● " + f.path;
              q(".ai-chips").appendChild(chip);
            }
          }
        }, refImage);
      } catch (streamErr) {
        // Streaming unavailable (older browser, proxy buffering, etc.) — fall back silently.
        q(".ai-stage").textContent = "Generating your website…";
        result = await aiGenerate(text, existing, refImage);
      }
      files = result.files; summary = result.summary || "";
      q(".ai-bar").style.width = "100%"; q(".ai-eta").textContent = "";
      q(".ai-sum").textContent = summary || `${files.length} files ready — review the preview, tweak the code if you like, then send it to the editor. Nothing is published until you press Publish.`;
      q(".ai-res").style.display = "block"; render();
    } catch (e) { showErr(e.message, true); }
    finally { clearInterval(elTimer); q(".ai-prog").style.display = "none"; q(".ai-go").style.display = ""; q(".ai-go").disabled = false; }
  }
  q(".ai-go").onclick = () => go(prompt.value);
  q(".ai-retry").onclick = () => go(lastPrompt || prompt.value);
  q(".ai-apply").onclick = async () => {
    const b = q(".ai-apply"); b.disabled = true;
    try { await onApply(files.map((f) => ({ path: f.path, enc: "utf8", data: f.content })), summary); }
    catch (e) { toast(e.message, "err"); }
    finally { b.disabled = false; }
  };
  return { destroy: () => clearInterval(elTimer) };
}
