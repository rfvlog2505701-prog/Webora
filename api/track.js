// Privacy-friendly analytics collector. Receives a tiny beacon from published
// pages and updates AGGREGATED counters only.
//
// What is stored:  per-day totals, per-page counts, referrer hostnames, device
//   category counts, and a per-day set of salted hashes used purely to count
//   unique visitors. The hash rotates every day (the day is part of the input),
//   so a visitor can't be followed across days; hashes older than 2 days are
//   deleted. No IP address, user-agent, cookie or fingerprint is ever stored.

const crypto = require("crypto");
const { db, getAdmin } = require("../lib/firebaseAdmin");

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|monitor|uptime|curl|wget|python|node-fetch|axios|go-http|java\//i;
const KEY_RE = /^[a-z0-9][a-z0-9~-]{0,60}$/;

const siteCache = new Map(); // siteKey -> expiry ms (short in-memory cache of "this site exists")

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const dayStr = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");

function deviceOf(ua) {
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}
function pageKey(p) {
  let s = String(p || "/").split(/[?#]/)[0].slice(0, 120);
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/index\.html$/i, "/") || "/";
  return encodeURIComponent(s).replace(/\./g, "%2E");
}
const hostKey = (h) => String(h).replace(/\./g, "%2E");

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();
  try {
    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
    if (!b || typeof b !== "object") return res.status(204).end();

    const siteKey = String(b.s || "");
    if (!KEY_RE.test(siteKey)) return res.status(204).end();

    const ua = String(req.headers["user-agent"] || "");
    if (!ua || BOT_RE.test(ua)) return res.status(204).end();

    const t = Date.now();
    if (!(siteCache.get(siteKey) > t)) {
      const exists = (await db().ref(`sitesPublic/${siteKey}/ownerUid`).get()).exists();
      if (!exists) return res.status(204).end();
      siteCache.set(siteKey, t + 5 * 60 * 1000);
      if (siteCache.size > 500) siteCache.clear();
    }

    const day = dayStr(t);
    const dev = deviceOf(ua);
    const ip = String((req.headers["x-forwarded-for"] || "").split(",")[0] || (req.socket && req.socket.remoteAddress) || "").trim();
    const salt = process.env.ANALYTICS_SALT || "webora-analytics";
    const hash = crypto.createHash("sha256").update([salt, siteKey, day, ip, ua].join("|")).digest("hex").slice(0, 20);

    // referrer: ignore same-host (internal navigation)
    let ref = "direct";
    const r = String(b.r || "").toLowerCase().replace(/^www\./, "");
    let selfHost = "";
    try { selfHost = new URL(req.headers.referer || req.headers.origin || "").hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { /* none */ }
    if (r && /^[a-z0-9.-]{1,80}$/.test(r) && r !== selfHost) ref = r;

    const inc = (n) => getAdmin().database.ServerValue.increment(n);
    const base = `analytics/${siteKey}`;
    const uvRef = db().ref(`${base}/uv/${day}/${hash}`);
    const isNew = !(await uvRef.get()).exists();

    const upd = {
      [`${base}/days/${day}/views`]: inc(1),
      [`${base}/days/${day}/pages/${pageKey(b.p)}`]: inc(1),
      [`${base}/days/${day}/refs/${hostKey(ref)}`]: inc(1),
      [`${base}/days/${day}/dev/${dev}`]: inc(1),
      [`${base}/totals/views`]: inc(1),
      [`${base}/last`]: { t, p: decodeURIComponent(pageKey(b.p)) },
    };
    if (isNew) {
      upd[`${base}/days/${day}/visitors`] = inc(1);
      upd[`${base}/totals/visitors`] = inc(1);
      upd[`${base}/uv/${day}/${hash}`] = 1;
      // privacy: drop hashes older than 2 days
      await db().ref(`${base}/uv/${dayStr(t - 2 * 86400000)}`).remove();
      await db().ref(`${base}/uv/${dayStr(t - 3 * 86400000)}`).remove();
    }
    await db().ref().update(upd);
    return res.status(204).end();
  } catch (e) {
    console.error(e);
    return res.status(204).end(); // never break the visitor's page
  }
};
