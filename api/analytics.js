// Returns real, aggregated analytics for one of the caller's websites.
// GET /api/analytics?key=<siteKey>&days=30   (or &from=YYYY-MM-DD&to=YYYY-MM-DD, UTC)
const { db, verifyIdToken } = require("../lib/firebaseAdmin");

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const toKey = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; };
const parseDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(t) ? null : t;
};
const sumRange = (days, a, b) => {
  let views = 0, visitors = 0;
  for (let t = a; t <= b; t += DAY) { const d = days[toKey(t)]; if (d) { views += d.views || 0; visitors += d.visitors || 0; } }
  return { views, visitors };
};

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const user = await verifyIdToken(req);
    const key = String(req.query.key || "");
    if (!key || /[.#$\[\]\/]/.test(key)) return res.status(400).json({ error: "Invalid site." });
    const site = (await db().ref(`sitesPublic/${key}`).get()).val();
    if (!site) return res.status(404).json({ error: "Website not found." });
    if (site.ownerUid !== user.uid) return res.status(403).json({ error: "You don't own this website." });

    const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    let to = parseDay(req.query.to) ?? today;
    let from = parseDay(req.query.from);
    if (from == null) { const n = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 366); from = to - (n - 1) * DAY; }
    if (from > to) [from, to] = [to, from];
    if ((to - from) / DAY > 365) from = to - 365 * DAY;
    to = Math.min(to, today);
    const span = Math.round((to - from) / DAY) + 1;
    const prevTo = from - DAY, prevFrom = prevTo - (span - 1) * DAY;

    const lo = Math.min(prevFrom, today - 29 * DAY);
    const snap = await db().ref(`analytics/${key}/days`).orderByKey().startAt(toKey(lo)).endAt(toKey(Math.max(to, today))).get();
    const days = snap.val() || {};

    const series = [];
    const pages = {}, refs = {}, dev = { desktop: 0, mobile: 0, tablet: 0 };
    for (let t = from; t <= to; t += DAY) {
      const d = days[toKey(t)] || {};
      series.push({ day: new Date(t).toISOString().slice(0, 10), views: d.views || 0, visitors: d.visitors || 0 });
      for (const [k, n] of Object.entries(d.pages || {})) pages[k] = (pages[k] || 0) + n;
      for (const [k, n] of Object.entries(d.refs || {})) refs[k] = (refs[k] || 0) + n;
      for (const [k, n] of Object.entries(d.dev || {})) if (k in dev) dev[k] += n;
    }
    const top = (o, n, dec) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ name: dec(k), views: v }));
    const totals = sumRange(days, from, to);
    const prev = sumRange(days, prevFrom, prevTo);
    const pct = (a, b) => (b === 0 ? (a > 0 ? null : 0) : Math.round(((a - b) / b) * 1000) / 10);
    const all = (await db().ref(`analytics/${key}/totals`).get()).val() || {};
    const last = (await db().ref(`analytics/${key}/last`).get()).val() || null;

    return res.status(200).json({
      site: { key, path: site.path, title: site.title },
      range: { from: new Date(from).toISOString().slice(0, 10), to: new Date(to).toISOString().slice(0, 10), days: span },
      totals: { ...totals, allTimeViews: all.views || 0, allTimeVisitors: all.visitors || 0 },
      growth: { views: pct(totals.views, prev.views), visitors: pct(totals.visitors, prev.visitors) },
      today: sumRange(days, today, today),
      week: sumRange(days, today - 6 * DAY, today),
      month: sumRange(days, today - 29 * DAY, today),
      series,
      pages: top(pages, 10, (k) => decodeURIComponent(k)),
      referrers: top(refs, 10, (k) => decodeURIComponent(k)),
      devices: dev,
      last: last ? { at: last.t, page: last.p } : null,
      note: "Days are in UTC. Unique visitors are counted per day using a daily-rotating hash, so multi-day totals add up each day's uniques.",
    });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error(e);
    return res.status(e.status || 500).json({ error: e.message || "Could not load analytics." });
  }
};
