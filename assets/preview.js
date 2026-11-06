// Builds a fully self-contained HTML document for the sandboxed preview iframe.
// Local CSS / JS / images / fonts / JSON are resolved from the project's files
// (no network, no same-origin access), so relative paths behave exactly like they
// will on the published site. The iframe uses sandbox="allow-scripts" WITHOUT
// allow-same-origin, so user code can never touch Webora's cookies, storage or auth.
import { isText, mimeOf, extOf, dataUri } from "/assets/fileutil.js";

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function resolvePath(base, rel) {
  if (rel == null) return null;
  rel = String(rel).trim();
  if (!rel || EXTERNAL.test(rel)) return null;
  rel = rel.split("#")[0].split("?")[0];
  let u = rel;
  if (u.startsWith("/")) u = u.slice(1);
  else { const d = base.includes("/") ? base.slice(0, base.lastIndexOf("/") + 1) : ""; u = d + u; }
  const out = [];
  for (const seg of u.split("/")) { if (seg === "..") out.pop(); else if (seg && seg !== ".") { try { out.push(decodeURIComponent(seg)); } catch (e) { out.push(seg); } } }
  return out.join("/");
}

export function buildPreview(filesIn, entry = "index.html") {
  const files = filesIn instanceof Map ? filesIn : new Map(filesIn.filter((f) => !f.dir).map((f) => [f.path, f]));
  const warnings = [];
  const warn = (m) => { if (!warnings.includes(m)) warnings.push(m); };
  const get = (p) => files.get(p);
  const entryRec = get(entry);
  if (!entryRec) return { html: page(`<h2>${esc(entry)} not found</h2><p>Create an <code>index.html</code> file in the project root to see a preview.</p>`), warnings: [`${entry} not found`], pages: [] };

  const uriFor = (from, rel, label) => {
    const p = resolvePath(from, rel);
    if (p === null) return null;
    const r = get(p);
    if (!r) { warn(`Missing file: ${p} (referenced from ${from}${label ? " " + label : ""})`); return null; }
    return dataUri(r);
  };

  function cssText(path, depth = 0, seen = new Set()) {
    const r = get(path);
    if (!r || seen.has(path) || depth > 5) return "";
    seen = new Set(seen).add(path);
    return rewriteCss(r.data, path, depth, seen);
  }
  function rewriteCss(css, from, depth = 0, seen = new Set()) {
    css = css.replace(/@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1\s*\)?([^;]*);/gi, (m, q, url) => {
      const p = resolvePath(from, url);
      if (p === null) return m;
      if (!get(p)) { warn(`Missing file: ${p} (@import in ${from})`); return ""; }
      return cssText(p, depth + 1, seen);
    });
    return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, q, url) => {
      const u = uriFor(from, url, "(url())");
      return u ? `url("${u}")` : m;
    });
  }

  function moduleUri(path, depth = 0, seen = new Set()) {
    const r = get(path);
    if (!r) return null;
    if (depth > 6 || seen.has(path)) return null;
    seen = new Set(seen).add(path);
    const code = r.data.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{0,2}\/[^"']+)\2/g, (m, pre, q, spec) => {
      const p = resolvePath(path, spec);
      const u = p && get(p) ? moduleUri(p, depth + 1, seen) : null;
      if (p && !get(p)) warn(`Missing file: ${p} (import in ${path})`);
      return u ? `${pre}${q}${u}${q}` : m;
    });
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
  }

  const hadDoctype = /^\s*<!doctype/i.test(entryRec.data);
  const doc = new DOMParser().parseFromString(entryRec.data, "text/html");
  doc.querySelectorAll("base").forEach((b) => b.remove());

  doc.querySelectorAll("link[href]").forEach((l) => {
    const rel = (l.getAttribute("rel") || "").toLowerCase();
    const href = l.getAttribute("href");
    if (rel.includes("stylesheet")) {
      const p = resolvePath(entry, href);
      if (p === null) return;
      if (!get(p)) { warn(`Missing file: ${p} (stylesheet in ${entry})`); return; }
      const st = doc.createElement("style");
      st.setAttribute("data-src", p);
      if (l.media) st.media = l.media;
      st.textContent = cssText(p);
      l.replaceWith(st);
    } else if (/icon|preload|manifest|modulepreload/.test(rel)) {
      const u = uriFor(entry, href);
      if (u) l.setAttribute("href", u);
    }
  });
  doc.querySelectorAll("style").forEach((s) => { if (!s.hasAttribute("data-src")) s.textContent = rewriteCss(s.textContent, entry); });
  doc.querySelectorAll("[style]").forEach((el) => { const v = el.getAttribute("style"); if (/url\(/i.test(v)) el.setAttribute("style", rewriteCss(v, entry)); });

  doc.querySelectorAll("script[src]").forEach((s) => {
    const src = s.getAttribute("src");
    const p = resolvePath(entry, src);
    if (p === null) return;
    const r = get(p);
    if (!r) { warn(`Missing file: ${p} (script in ${entry})`); return; }
    s.removeAttribute("src");
    s.removeAttribute("integrity");
    s.removeAttribute("crossorigin");
    s.textContent = (s.type === "module" ? (moduleUri(p) ? decodeURIComponent(moduleUri(p).split(",").slice(1).join(",")) : r.data) : r.data).replace(/<\/script/gi, "<\\/script");
  });
  doc.querySelectorAll('script[type="module"]:not([src])').forEach((s) => {
    s.textContent = s.textContent.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{0,2}\/[^"']+)\2/g, (m, pre, q, spec) => {
      const p = resolvePath(entry, spec); const u = p && get(p) ? moduleUri(p) : null;
      return u ? `${pre}${q}${u}${q}` : m;
    }).replace(/<\/script/gi, "<\\/script");
  });

  const attrs = [["img", "src"], ["source", "src"], ["video", "src"], ["video", "poster"], ["audio", "src"], ["track", "src"], ["embed", "src"], ["object", "data"], ["input", "src"], ["image", "href"], ["image", "xlink:href"], ["use", "href"]];
  for (const [tag, at] of attrs) {
    doc.querySelectorAll(`${tag}[${at.replace(":", "\\:")}]`).forEach((el) => {
      const v = el.getAttribute(at);
      if (tag === "use" && v.startsWith("#")) return;
      const u = uriFor(entry, v, `<${tag}>`);
      if (u) el.setAttribute(at, u);
    });
  }
  doc.querySelectorAll("[srcset]").forEach((el) => {
    el.setAttribute("srcset", el.getAttribute("srcset").split(",").map((part) => {
      const [url, ...rest] = part.trim().split(/\s+/);
      const u = uriFor(entry, url, "(srcset)");
      return [u || url, ...rest].join(" ");
    }).join(", "));
  });

  // data for the runtime shim: fetch()/XHR + page navigation
  const map = {};
  let budget = 3 * 1024 * 1024;
  for (const [p, r] of files) {
    const t = isText(p);
    const size = r.data.length;
    if (!t && size > 400 * 1024) continue;
    if (budget - size < 0) continue;
    budget -= size;
    map[p] = t ? { t: 1, m: mimeOf(p), d: r.data } : { m: mimeOf(p), d: r.data };
  }
  const pages = [...files.keys()].filter((p) => /\.html?$/i.test(p));
  const shim = `<script>${SHIM.replace("__FILES__", () => JSON.stringify(map).replace(/</g, "\\u003c")).replace("__ENTRY__", () => JSON.stringify(entry))}</script>`;
  const head = doc.head || doc.documentElement.insertBefore(doc.createElement("head"), doc.body);
  head.insertAdjacentHTML("afterbegin", shim);
  return { html: (hadDoctype ? "<!DOCTYPE html>" : "") + doc.documentElement.outerHTML, warnings, pages };
}

const SHIM = `(function(){
var F=__FILES__,E=__ENTRY__;
function say(o){try{parent.postMessage(Object.assign({wp:1},o),"*")}catch(e){}}
function res(u){u=String(u==null?"":u).trim();if(!u||/^([a-z][a-z0-9+.-]*:|\\/\\/|#)/i.test(u))return null;u=u.split("#")[0].split("?")[0];
 if(u[0]=="/")u=u.slice(1);else{u=(E.indexOf("/")<0?"":E.slice(0,E.lastIndexOf("/")+1))+u}
 var o=[];u.split("/").forEach(function(s){if(s==="..")o.pop();else if(s&&s!==".")try{o.push(decodeURIComponent(s))}catch(e){o.push(s)}});return o.join("/")}
function uri(e){return e.t?"data:"+e.m+";charset=utf-8,"+encodeURIComponent(e.d):"data:"+e.m+";base64,"+e.d}
var of=window.fetch;
window.fetch=function(i,o){var u=typeof i==="string"?i:(i&&i.url)||String(i),p=res(u);
 if(p!==null){var e=F[p];if(e)return of.call(window,uri(e));say({k:"warn",m:"fetch: file not found in project: "+p});return Promise.resolve(new Response("Not found",{status:404}))}
 return of.apply(window,arguments)};
var xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){var p=res(u);if(p!==null){var e=F[p];if(e){arguments[1]=uri(e)}else say({k:"warn",m:"XHR: file not found in project: "+p})}return xo.apply(this,arguments)};
addEventListener("error",function(e){if(e.target&&e.target!==window){var s=e.target.src||e.target.href;if(s&&String(s).slice(0,5)!=="data:")say({k:"error",m:"Failed to load "+s})}else say({k:"error",m:e.message,l:e.lineno,c:e.colno,f:(e.filename||"").slice(0,60)})},true);
addEventListener("unhandledrejection",function(e){say({k:"error",m:"Unhandled promise rejection: "+(e.reason&&e.reason.message||e.reason)})});
["error","warn","log"].forEach(function(k){var o=console[k];console[k]=function(){try{say({k:k==="log"?"log":k,m:[].slice.call(arguments).map(function(a){try{return typeof a==="string"?a:JSON.stringify(a)}catch(e){return String(a)}}).join(" ").slice(0,400)})}catch(e){}o&&o.apply(console,arguments)}});
document.addEventListener("click",function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest("a[href]");if(!a||ev.defaultPrevented)return;var h=a.getAttribute("href");
 if(h.charAt(0)==="#"){ev.preventDefault();var id=decodeURIComponent(h.slice(1));var el=id&&document.getElementById(id);if(el)el.scrollIntoView({behavior:"smooth"});else if(!id)scrollTo(0,0);return}
 var p=res(h);if(p===null){if(/^(mailto:|tel:|javascript:)/i.test(h))return;ev.preventDefault();try{window.open(a.href,"_blank","noopener")}catch(e){}return}
 ev.preventDefault();if(F[p]&&/\\.html?$/i.test(p))say({k:"nav",p:p});else say({k:"warn",m:"Link target not found in project: "+p})});
document.addEventListener("submit",function(e){e.preventDefault();say({k:"log",m:"Form submit blocked in preview."})});
addEventListener("load",function(){say({k:"loaded"})});
})();`;

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function page(inner) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;min-height:100vh;display:grid;place-content:center;text-align:center;font-family:system-ui,sans-serif;background:#070d22;color:#9db4e8;padding:24px}h2{color:#fff}code{background:#14214d;padding:2px 6px;border-radius:5px}</style></head><body><div>${inner}</div></body></html>`;
}
export const blankPage = (msg) => page(`<h2>${esc(msg)}</h2>`);
