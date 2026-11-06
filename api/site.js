const { db } = require("../lib/firebaseAdmin");
const { parsePath, pathToKey } = require("../lib/ids");
const P = require("../lib/projects");

const DOMAIN = process.env.PUBLIC_DOMAIN || "https://webora-lovat.vercel.app";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Adsterra snippets — only ever injected on sites published through the
// developer API (see record.viaApi in api/publish.js). Sites made directly
// in the Webora dashboard stay ad-free.
const ADS_SNIPPET = `
<script>
  atOptions = { 'key' : 'c75ab2ed579cba699d79a71b43c259dd', 'format' : 'iframe', 'height' : 60, 'width' : 468, 'params' : {} };
</script>
<script src="https://www.highrevenueformat.com/c75ab2ed579cba699d79a71b43c259dd/invoke.js"></script>
<script src="https://pl31982276.profitableratecpmnetwork.com/12/3e/a4/123ea4b096204a3ff2aebea2d0927b44.js"></script>
`;

// Privacy-friendly page-view beacon: sends only the site key, the page path and
// the referrer's hostname. No cookies, no storage, no IDs.
function trackSnippet(siteKey, page) {
  return `<script>(function(){try{var u=${JSON.stringify(DOMAIN + "/api/track")},d=JSON.stringify({s:${JSON.stringify(siteKey)},p:${JSON.stringify(page)},r:document.referrer?new URL(document.referrer).hostname:""});if(navigator.sendBeacon){navigator.sendBeacon(u,d)}else{fetch(u,{method:"POST",body:d,keepalive:true,mode:"no-cors"})}}catch(e){}})();</script>`;
}

// Multi-file sites use <base>, which would make "#section" links reload the
// page. This tiny shim keeps in-page anchors scrolling smoothly instead.
const ANCHOR_SHIM = `<script>document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href^="#"]');if(!a)return;var id=decodeURIComponent(a.getAttribute("href").slice(1));if(!id)return;var el=document.getElementById(id);if(el){e.preventDefault();el.scrollIntoView({behavior:"smooth"})}});</script>`;

function render(site, path, injectAds, opts = {}) {
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

  let bodyExtra = js ? `<script>${js}</script>` : "";
  if (opts.multi) bodyExtra += ANCHOR_SHIM;
  if (injectAds) bodyExtra += ADS_SNIPPET;
  bodyExtra += trackSnippet(pathToKey(path), opts.page || "/");

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

    if (site.multi) {
      const idx = (await db().ref(`sitesFiles/${key}/${P.fileKey("index.html")}`).get()).val();
      const html = idx ? idx.data : site.html;
      return sendHtml(res, 200, render(site, parsed.path, !!site.viaApi, { multi: true, html, page: "/", isIndex: true }));
    }
    return sendHtml(res, 200, render(site, parsed.path, !!site.viaApi, { page: "/" }));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Unable to load website");
  }
};

async function serveFile(res, rec, rel, key, path) {
  const mime = P.mimeOf(rel);
  if (/^text\/html/.test(mime)) {
    const site = (await db().ref(`sitesPublic/${key}`).get()).val() || {};
    return sendHtml(res, 200, render(site, path, !!site.viaApi, { multi: true, html: rec.data, page: pageOf(rel) }));
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
    return sendHtml(res, 404, render(site, path, false, { multi: true, html: r.data, page: "/404" }));
  }
  return res.status(404).send("Not found");
}

module.exports.render = render;
