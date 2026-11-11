const { db } = require("../lib/firebaseAdmin");
const { parsePath, pathToKey } = require("../lib/ids");
const P = require("../lib/projects");

const DOMAIN = process.env.PUBLIC_DOMAIN || "https://webora-lovat.vercel.app";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Published pages are served with a `sandbox` CSP (see sendHtml below) and
// deliberately WITHOUT `allow-same-origin`, so a published site can never
// read Webora's own cookies/login storage. The tradeoff: a sandboxed page
// without allow-same-origin gets an opaque/"null" origin, and in that state
// `localStorage`/`sessionStorage` THROW a SecurityError on first touch —
// which, if the generated site's own script isn't wrapped in try/catch
// (most AI-generated or copy-pasted code isn't), kills that whole <script>
// block immediately. That is the exact bug reported: the page paints once,
// then — the instant some script does `localStorage.getItem(...)` for a
// theme toggle, a counter, a saved form draft, etc. — every later line in
// that script (including CSS class toggles) silently never runs. This shim
// runs first, before any of the site's own code, and swaps in an in-memory
// polyfill ONLY if the real storage is blocked, so that code keeps working
// (state just doesn't persist across reloads) instead of crashing outright.
const SAFE_STORAGE = `<script>(function(){
function poly(){function S(){this.d={}}S.prototype.getItem=function(k){return Object.prototype.hasOwnProperty.call(this.d,k)?this.d[k]:null};S.prototype.setItem=function(k,v){this.d[k]=String(v)};S.prototype.removeItem=function(k){delete this.d[k]};S.prototype.clear=function(){this.d={}};S.prototype.key=function(i){return Object.keys(this.d)[i]==null?null:Object.keys(this.d)[i]};Object.defineProperty(S.prototype,"length",{get:function(){return Object.keys(this.d).length}});return S}
var S=poly();
["localStorage","sessionStorage"].forEach(function(name){
  try{ var t="__wb_probe__"; window[name].setItem(t,"1"); window[name].removeItem(t); }
  catch(e){ try{ Object.defineProperty(window,name,{value:new S(),configurable:true}); }catch(e2){} }
});
})();</script>`;

// "W" loading screen shown the instant a published site opens (same look as
// the Webora app's own loader). Self-contained — no external CSS/JS — so it
// works on every published site regardless of host. It removes itself once
// the page has fully loaded (or after a short safety timeout), so it never
// gets stuck on a slow asset.
const W_LOADER = `
<div id="__wb_ld" style="position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#f6f4ff;transition:opacity .2s ease,visibility .2s">
  <svg viewBox="0 0 120 80" width="96" height="64" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-label="Loading">
    <defs>
      <linearGradient id="__wbB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#5b21b6"/></linearGradient>
      <linearGradient id="__wbF" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" stop-color="#4318d8"/></linearGradient>
    </defs>
    <path d="M16 15 L40 62 L60 27 L80 62 L104 15" transform="translate(5 5)" stroke="url(#__wbB)" stroke-width="16" pathLength="100"/>
    <path id="__wbFront" d="M16 15 L40 62 L60 27 L80 62 L104 15" stroke="url(#__wbF)" stroke-width="15" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>
  </svg>
</div>
<style>
#__wb_ld.__wb_hide{opacity:0;visibility:hidden;pointer-events:none}
#__wbFront{animation:__wbdraw .45s cubic-bezier(.22,.8,.24,1) forwards}
@keyframes __wbdraw{to{stroke-dashoffset:0}}
</style>
<script>(function(){
  var el=document.getElementById("__wb_ld");
  if(!el)return;
  var done=false;
  function hide(){ if(done)return; done=true; el.classList.add("__wb_hide"); setTimeout(function(){ el.remove(); },220); }
  if(document.readyState==="complete"){ setTimeout(hide,0); }
  else { window.addEventListener("load",function(){ setTimeout(hide,0); }); }
  setTimeout(hide,2500); // safety: never block the page for long
})();</script>`;

// Privacy-friendly page-view beacon: sends only the site key, the page path and
// the referrer's hostname. No cookies, no storage, no IDs. Exposed as
// window.__wbTrack so SPA_NAV (below) can call it again on every soft page
// change — a real <script> tag only ever runs once, but a visit to each
// "page" of a multi-file site should still count as its own page view.
function trackSnippet(siteKey, page) {
  return `<script data-wb-infra="1">(function(){var s=${JSON.stringify(siteKey)};function send(p){try{var u=${JSON.stringify(DOMAIN + "/api/track")},d=JSON.stringify({s:s,p:p,r:document.referrer?new URL(document.referrer).hostname:""});if(navigator.sendBeacon){navigator.sendBeacon(u,d)}else{fetch(u,{method:"POST",body:d,keepalive:true,mode:"no-cors"})}}catch(e){}}window.__wbTrack=send;send(${JSON.stringify(page)});})();</script>`;
}

// Multi-file sites use <base>, which would make "#section" links reload the
// page. This tiny shim keeps in-page anchors scrolling smoothly instead.
const ANCHOR_SHIM = `<script data-wb-infra="1">document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href^="#"]');if(!a)return;var id=decodeURIComponent(a.getAttribute("href").slice(1));if(!id)return;var el=document.getElementById(id);if(el){e.preventDefault();el.scrollIntoView({behavior:"smooth"})}});</script>`;

// ───────────────────────────────────────────────────────────────────────
// SPA-style navigation for multi-file sites.
//
// Why this exists: every "page" of a multi-file project is served as its
// own full document (that's what makes /about, /blog/post-1, etc. real
// routes). A plain <a href="about.html"> click used to do a normal browser
// navigation — a brand-new document, which (a) replays the full-screen W
// loader on every single click between pages of the SAME site, so it never
// feels like one app, and (b) — because published pages are sandboxed
// without allow-same-origin (see SAFE_STORAGE above) — gets a FRESH opaque
// origin on every navigation, so anything a page saved to localStorage
// (e.g. a note created on notes-create.html) is simply gone by the time the
// next page's script runs. That's the exact "create a note, go home, it's
// not there" bug.
//
// The fix: intercept clicks on same-site links that point at another page
// of the project and swap the <body> in place via fetch() + history.pushState
// instead of a real navigation. Nothing reloads, so the loader only ever
// shows once (on the real first load) and localStorage/sessionStorage (real
// or the SAFE_STORAGE polyfill) stays the SAME instance across every page of
// the site — exactly the "connected pages, feels like one app" behavior.
// Falls back to a normal navigation for anything it isn't confident about
// (cross-site links, non-HTML targets, a failed fetch).
const SPA_NAV = `<script data-wb-infra="1">(function(){
var NONPAGE=/\\.(css|js|mjs|json|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot|mp3|wav|ogg|mp4|webm|pdf|zip|txt|xml|csv|map)(?:[?#]|$)/i;
function sameOrigin(href){ try{ return new URL(href, location.href).origin===location.origin; }catch(e){ return false; } }
function swap(url, push){
  fetch(url).then(function(res){
    if(!res.ok) throw 0;
    return res.text();
  }).then(function(html){
    var doc=new DOMParser().parseFromString(html,"text/html");
    var ld=doc.getElementById("__wb_ld"); if(ld)ld.remove();
    var scripts=[];
    doc.querySelectorAll("script").forEach(function(s){
      if(s.hasAttribute("data-wb-infra")) s.remove(); else { scripts.push(s); s.remove(); }
    });
    if(doc.title) document.title=doc.title;
    var nd=doc.querySelector('meta[name="description"]'), cd=document.querySelector('meta[name="description"]');
    if(nd&&cd) cd.setAttribute("content", nd.getAttribute("content")||"");
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(function(l){
      var href=l.getAttribute("href");
      if(href && !document.head.querySelector('link[rel="stylesheet"][href="'+href.replace(/"/g,"")+'"]')){
        var nl=document.createElement("link"); nl.rel="stylesheet"; nl.href=href; document.head.appendChild(nl);
      }
    });
    document.body.innerHTML = doc.body.innerHTML;
    scripts.forEach(function(old){
      var s=document.createElement("script");
      for(var i=0;i<old.attributes.length;i++) s.setAttribute(old.attributes[i].name, old.attributes[i].value);
      if(!old.src) s.textContent=old.textContent;
      document.body.appendChild(s);
    });
    if(push) history.pushState({__wbspa:1}, "", url);
    window.scrollTo(0,0);
    if(window.__wbTrack){ try{ window.__wbTrack(new URL(url,location.href).pathname); }catch(e){} }
    document.dispatchEvent(new CustomEvent("webora:navigated",{detail:{url:url}}));
  }).catch(function(){ location.href=url; });
}
document.addEventListener("click",function(e){
  if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  var a=e.target&&e.target.closest&&e.target.closest("a[href]"); if(!a)return;
  var href=a.getAttribute("href");
  if(!href||href.charAt(0)==="#"||/^(mailto:|tel:|javascript:)/i.test(href))return;
  if(a.target&&a.target!==""&&a.target!=="_self")return;
  if(a.hasAttribute("download"))return;
  if(!sameOrigin(a.href)||NONPAGE.test(a.href))return;
  e.preventDefault();
  if(a.href!==location.href) swap(a.href, true);
});
addEventListener("popstate",function(){ swap(location.href, false); });
})();</script>`;

// Non-secret environment/config variables set in Studio, exposed to the
// published page's own JS as `window.ENV`. "secret"-typed variables are
// deliberately never sent here — see lib/env.js.
function envSnippet(envConfig) {
  if (!envConfig || !Object.keys(envConfig).length) return "";
  return `<script data-wb-infra="1">window.ENV=${JSON.stringify(envConfig)};</script>`;
}


// ── Adsterra ads (shown on every published page) ─────────────────────────
// Social bar + popunder load once per real page load (data-wb-infra scripts
// are dropped by SPA_NAV on soft navigation, so they never double up).
// The banner is a normal script so it re-renders after each soft page swap.
const ADS_ONCE = `<script data-wb-infra="1" src="https://pl31982276.profitableratecpmnetwork.com/12/3e/a4/123ea4b096204a3ff2aebea2d0927b44.js"></script><script data-wb-infra="1" src="https://pl32003609.profitableratecpmnetwork.com/dd/bb/71/ddbb712826a2a0ef0466cf584a6f7ef7.js"></script>`;
const ADS_BANNER = `<div style="display:flex;justify-content:center;padding:12px 0;overflow:hidden"><script>atOptions={'key':'c75ab2ed579cba699d79a71b43c259dd','format':'iframe','height':60,'width':468,'params':{}};</script><script src="https://www.highrevenueformat.com/c75ab2ed579cba699d79a71b43c259dd/invoke.js"></script></div>`;

function render(site, path, opts = {}) {
  let h = String(opts.html != null ? opts.html : site.html || "").trim() || "<html><head></head><body></body></html>";
  if (!/<html[\s>]/i.test(h)) h = `<!doctype html><html><head></head><body>${h}</body></html>`;

  const title = String(site.title || path).slice(0, 150);
  const desc = String(site.description || `Visit ${title}, published with Webora.`).slice(0, 300);
  const url = `${DOMAIN}/${path}`;

  const base = opts.multi ? `\n <base href="/${esc(path)}/">` : "";
  const meta = `${SAFE_STORAGE}${base}
 <title>${esc(title)}</title>
 <meta name="description" content="${esc(desc)}">
 <meta name="robots" content="index,follow">
 <link rel="canonical" href="${esc(url)}">
 <meta property="og:title" content="${esc(title)}">
 <meta property="og:description" content="${esc(desc)}">
 <meta property="og:url" content="${esc(url)}">
 <meta property="og:type" content="website">
 `;

  // multi-file pages keep their own <title>/<meta>; only add what is missing
  let metaToAdd = meta;
  if (opts.multi) {
    metaToAdd = SAFE_STORAGE + base;
    if (!/<title[\s>]/i.test(h)) metaToAdd += `\n <title>${esc(title)}</title>`;
    if (!/name=["']description["']/i.test(h)) metaToAdd += `\n <meta name="description" content="${esc(desc)}">`;
    if (opts.isIndex) metaToAdd += `\n <link rel="canonical" href="${esc(url)}">`;
  }

  h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, (m) => m + metaToAdd) : h.replace(/<html[^>]*>/i, (m) => m + `<head>${metaToAdd}</head>`);

  const css = String(site.css || "").replace(/<\/style/gi, "<\\/style");
  const js = String(site.js || "").replace(/<\/script/gi, "<\\/script");
  if (css) h = h.replace(/<\/head>/i, `<style>${css}</style></head>`);

  // Loader goes first inside <body> so it covers the page before anything
  // else paints.
  let bodyStart = W_LOADER;
  let bodyExtra = js ? `<script>${js}</script>` : "";
  bodyExtra += envSnippet(opts.envConfig);
  if (opts.multi) bodyExtra += ANCHOR_SHIM + SPA_NAV;
  bodyExtra += ADS_BANNER + ADS_ONCE;
  bodyExtra += trackSnippet(pathToKey(path), opts.page || "/");

  h = /<body[^>]*>/i.test(h) ? h.replace(/<body[^>]*>/i, (m) => m + bodyStart) : `<body>${bodyStart}${h}`;
  h = /<\/body>/i.test(h) ? h.replace(/<\/body>/i, bodyExtra + "</body>") : h + bodyExtra;

  return "<!doctype html>" + h.replace(/^\s*<!doctype[^>]*>/i, "");
}

function sendHtml(res, status, body) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // allow-top-navigation-by-user-activation: lets a real <a> click or form
  // submit actually leave/replace the page when SPA_NAV's fetch-based swap
  // isn't used (cross-site links, or its fallback after a failed fetch) —
  // without it, some browsers silently swallow navigation on a sandboxed
  // *top-level* document, which looked like "links just don't work".
  res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-top-navigation-by-user-activation");
  res.setHeader("X-Robots-Tag", "index, follow");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res.status(status).send(body);
}

function pageOf(rel) {
  if (!rel || rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
  return "/" + rel;
}

async function loadEnvConfig(ownerUid, projectId) {
  if (!ownerUid || !projectId) return null;
  try {
    const all = (await db().ref(`projectEnv/${ownerUid}/${projectId}`).get()).val() || {};
    const out = {};
    for (const [k, v] of Object.entries(all)) if (v && v.type !== "secret") out[k] = v.value;
    return Object.keys(out).length ? out : null;
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  const parsed = parsePath(req.query.username);
  if (!parsed.ok) return res.status(404).send("Website not found");

  try {
    const key = pathToKey(parsed.path);
    const rawP = req.query.p == null ? "" : Array.isArray(req.query.p) ? req.query.p.join("/") : String(req.query.p);

    // ---- sub-path request (assets / extra pages of a multi-file site)
    if (rawP && rawP !== "/") {
      let rel;
      try { rel = P.normalizePath(decodeURIComponent(rawP)); } catch (e) { return res.status(404).send("Not found"); }
      const hasExt = !!P.extOf(rel);
      const candidates = hasExt ? [rel] : [rel + ".html", rel + "/index.html"];
      let rec = null, found = null;
      for (const c of candidates) {
        const r = (await db().ref(`sitesFiles/${key}/${P.fileKey(c)}`).get()).val();
        if (r) { rec = r; found = c; break; }
      }
      if (!rec) return notFound(res, key, parsed.path);
      return serveFile(res, rec, found, key, parsed.path);
    }

    // ---- site root
    const site = (await db().ref(`sitesPublic/${key}`).get()).val();
    if (!site || !site.html) return res.status(404).send("Website not found");
    const envConfig = await loadEnvConfig(site.ownerUid, site.projectId);

    if (site.multi) {
      const idx = (await db().ref(`sitesFiles/${key}/${P.fileKey("index.html")}`).get()).val();
      const html = idx ? idx.data : site.html;
      return sendHtml(res, 200, render(site, parsed.path, { multi: true, html, page: "/", isIndex: true, envConfig }));
    }
    return sendHtml(res, 200, render(site, parsed.path, { page: "/", envConfig }));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Unable to load website");
  }
};

async function serveFile(res, rec, rel, key, path) {
  const mime = P.mimeOf(rel);
  if (/^text\/html/.test(mime)) {
    const site = (await db().ref(`sitesPublic/${key}`).get()).val() || {};
    const envConfig = await loadEnvConfig(site.ownerUid, site.projectId);
    return sendHtml(res, 200, render(site, path, { multi: true, html: rec.data, page: pageOf(rel), envConfig }));
  }
  res.setHeader("Content-Type", mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Origin", "*"); // lets fonts / fetch() work from the sandboxed page
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  if (/svg|xml/.test(mime)) res.setHeader("Content-Security-Policy", "sandbox");
  const body = rec.enc === "base64" ? Buffer.from(rec.data, "base64") : String(rec.data);
  return res.status(200).send(body);
}

async function notFound(res, key, path) {
  const r = (await db().ref(`sitesFiles/${key}/${P.fileKey("404.html")}`).get()).val();
  if (r) {
    const site = (await db().ref(`sitesPublic/${key}`).get()).val() || {};
    return sendHtml(res, 404, render(site, path, { multi: true, html: r.data, page: "/404" }));
  }
  return res.status(404).send("Not found");
}

module.exports.render = render;
