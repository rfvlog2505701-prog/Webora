const { db } = require("../lib/firebaseAdmin");
const { parsePath, pathToKey } = require("../lib/ids");
const P = require("../lib/projects");

const DOMAIN = process.env.PUBLIC_DOMAIN || "https://webora-lovat.vercel.app";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "W" loading screen shown the instant a published site opens (same look as
// the Webora app's own loader). Self-contained — no external CSS/JS — so it
// works on every published site regardless of host. It removes itself once
// the page has fully loaded (or after a short safety timeout), so it never
// gets stuck on a slow asset.
const W_LOADER = `
<div id="__wb_ld" style="position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 40%,#0b1a4a 0%,#030814 70%);transition:opacity .45s ease,visibility .45s">
  <svg viewBox="0 0 120 80" width="96" height="64" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-label="Loading">
    <defs>
      <linearGradient id="__wbB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7d8ee0"/><stop offset="1" stop-color="#3a4aa6"/></linearGradient>
      <linearGradient id="__wbF" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#d4dcff"/><stop offset="1" stop-color="#93a8ff"/></linearGradient>
    </defs>
    <path d="M16 15 L40 62 L60 27 L80 62 L104 15" transform="translate(5 5)" stroke="url(#__wbB)" stroke-width="16" pathLength="100"/>
    <path id="__wbFront" d="M16 15 L40 62 L60 27 L80 62 L104 15" stroke="url(#__wbF)" stroke-width="15" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>
  </svg>
</div>
<style>
#__wb_ld.__wb_hide{opacity:0;visibility:hidden;pointer-events:none}
#__wbFront{animation:__wbdraw 1s cubic-bezier(.22,.8,.24,1) forwards}
@keyframes __wbdraw{to{stroke-dashoffset:0}}
</style>
<script>(function(){
  var el=document.getElementById("__wb_ld");
  if(!el)return;
  var done=false;
  function hide(){ if(done)return; done=true; el.classList.add("__wb_hide"); setTimeout(function(){ el.remove(); },500); }
  if(document.readyState==="complete"){ setTimeout(hide,250); }
  else { window.addEventListener("load",function(){ setTimeout(hide,150); }); }
  setTimeout(hide,4000); // safety: never block the page for long
})();</script>`;

// Privacy-friendly page-view beacon: sends only the site key, the page path and
// the referrer's hostname. No cookies, no storage, no IDs.
function trackSnippet(siteKey, page) {
  return `<script>(function(){try{var u=${JSON.stringify(DOMAIN + "/api/track")},d=JSON.stringify({s:${JSON.stringify(siteKey)},p:${JSON.stringify(page)},r:document.referrer?new URL(document.referrer).hostname:""});if(navigator.sendBeacon){navigator.sendBeacon(u,d)}else{fetch(u,{method:"POST",body:d,keepalive:true,mode:"no-cors"})}}catch(e){}})();</script>`;
}

// Multi-file sites use <base>, which would make "#section" links reload the
// page. This tiny shim keeps in-page anchors scrolling smoothly instead.
const ANCHOR_SHIM = `<script>document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href^="#"]');if(!a)return;var id=decodeURIComponent(a.getAttribute("href").slice(1));if(!id)return;var el=document.getElementById(id);if(el){e.preventDefault();el.scrollIntoView({behavior:"smooth"})}});</script>`;

// Non-secret environment/config variables set in Studio, exposed to the
// published page's own JS as `window.ENV`. "secret"-typed variables are
// deliberately never sent here — see lib/env.js.
function envSnippet(envConfig) {
  if (!envConfig || !Object.keys(envConfig).length) return "";
  return `<script>window.ENV=${JSON.stringify(envConfig)};</script>`;
}

function render(site, path, opts = {}) {
  let h = String(opts.html != null ? opts.html : site.html || "").trim() || "<html><head></head><body></body></html>";
  if (!/<html[\s>]/i.test(h)) h = `<!doctype html><html><head></head><body>${h}</body></html>`;

  const title = String(site.title || path).slice(0, 150);
  const desc = String(site.description || `Visit ${title}, published with Webora.`).slice(0, 300);
  const url = `${DOMAIN}/${path}`;

  const base = opts.multi ? `\n <base href="/${esc(path)}/">` : "";
  const meta = `${base}
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
    metaToAdd = base;
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
  if (opts.multi) bodyExtra += ANCHOR_SHIM;
  bodyExtra += trackSnippet(pathToKey(path), opts.page || "/");

  h = /<body[^>]*>/i.test(h) ? h.replace(/<body[^>]*>/i, (m) => m + bodyStart) : `<body>${bodyStart}${h}`;
  h = /<\/body>/i.test(h) ? h.replace(/<\/body>/i, bodyExtra + "</body>") : h + bodyExtra;

  return "<!doctype html>" + h.replace(/^\s*<!doctype[^>]*>/i, "");
}

function sendHtml(res, status, body) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups allow-modals");
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
