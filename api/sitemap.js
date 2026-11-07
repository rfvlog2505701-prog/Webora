const { db } = require("../lib/firebaseAdmin");
const { keyToPath } = require("../lib/ids");

const DOMAIN = process.env.PUBLIC_DOMAIN || "https://webora-lovat.vercel.app";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

module.exports = async (req, res) => {
  try {
    const snap = await db().ref("sitesPublic").get();
    const sites = snap.exists() ? snap.val() : {};

    const urls = [
      `<url><loc>${DOMAIN}/</loc></url>`,
      `<url><loc>${DOMAIN}/login.html</loc></url>`,
      `<url><loc>${DOMAIN}/register.html</loc></url>`,
    ];

    for (const key of Object.keys(sites)) {
      const path = keyToPath(key);
      urls.push(`<url><loc>${esc(`${DOMAIN}/${path}`)}</loc></url>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).send(xml);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Sitemap generation failed");
  }
};
