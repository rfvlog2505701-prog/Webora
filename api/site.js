const { db } = require("../lib/firebaseAdmin");
const { parsePath, pathToKey } = require("../lib/ids");

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

function render(site, path, injectAds) {
  let h = String(site.html || "").trim() || "<html><head></head><body></body></html>";
  if (!/<html[\s>]/i.test(h)) h = `<!doctype html><html><head></head><body>${h}</body></html>`;

  const title = String(site.title || path).slice(0, 150);
  const desc = String(site.description || `Visit ${title}, published with Webora.`).slice(0, 300);
  const url = `${DOMAIN}/${path}`;

  const meta = `
 <title>${esc(title)}</title>
 <meta name="description" content="${esc(desc)}">
 <meta name="robots" content="index,follow">
 <link rel="canonical" href="${esc(url)}">
 <meta property="og:title" content="${esc(title)}">
 <meta property="og:description" content="${esc(desc)}">
 <meta property="og:url" content="${esc(url)}">
 <meta property="og:type" content="website">
 `;

  h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, (m) => m + meta) : h.replace(/<html[^>]*>/i, (m) => m + `<head>${meta}</head>`);

  const css = String(site.css || "").replace(/<\/style/gi, "<\\/style");
  const js = String(site.js || "").replace(/<\/script/gi, "<\\/script");
  if (css) h = h.replace(/<\/head>/i, `<style>${css}</style></head>`);

  let bodyExtra = js ? `<script>${js}</script>` : "";
  if (injectAds) bodyExtra += ADS_SNIPPET;

  h = /<\/body>/i.test(h) ? h.replace(/<\/body>/i, bodyExtra + "</body>") : h + bodyExtra;

  return "<!doctype html>" + h.replace(/^\s*<!doctype[^>]*>/i, "");
}

module.exports = async (req, res) => {
  const parsed = parsePath(req.query.username);
  if (!parsed.ok) return res.status(404).send("Website not found");

  try {
    const key = pathToKey(parsed.path);
    const site = (await db().ref(`sitesPublic/${key}`).get()).val();

    if (!site || !site.html) return res.status(404).send("Website not found");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups allow-modals");
    res.setHeader("X-Robots-Tag", "index, follow");
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

    return res.status(200).send(render(site, parsed.path, !!site.viaApi));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Unable to load website");
  }
};
