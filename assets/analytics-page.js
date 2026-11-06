// Analytics dashboard — renders ONLY data returned by /api/analytics (real collected counts).
import { mountHeader, setAvatar, hideLoader, icons, esc, $, toast, miniLoader } from "/assets/layout.js";
import { auth, onAuthStateChanged, signOut } from "/assets/firebase-client.js";
import { analytics } from "/assets/api.js";
import { countUp } from "/assets/fx.js";

const key = new URLSearchParams(location.search).get("key");
let range = { days: 30 }, data = null;
mountHeader("app", async () => { await signOut(auth); location.href = "/"; });

const fmt = (n) => Number(n || 0).toLocaleString();
const pct = (g) => (g == null ? '<em class="up">new</em>' : g === 0 ? '<em style="color:var(--muted)">±0%</em>' : `<em class="${g > 0 ? "up" : "down"}">${g > 0 ? "▲" : "▼"} ${Math.abs(g)}%</em>`);
const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + " min ago" : s < 86400 ? Math.floor(s / 3600) + " h ago" : new Date(t).toLocaleDateString(); };

function chart(series) {
  const W = 760, H = 240, pl = 38, pr = 12, pt = 14, pb = 26;
  const max = Math.max(1, ...series.map((d) => d.views));
  const niceMax = max <= 4 ? 4 : Math.ceil(max / 4 / Math.pow(10, Math.floor(Math.log10(max / 4)))) * Math.pow(10, Math.floor(Math.log10(max / 4))) * 4;
  const x = (i) => pl + (series.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (series.length - 1));
  const y = (v) => pt + (1 - v / niceMax) * (H - pt - pb);
  const line = (k) => series.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d[k]).toFixed(1)}`).join(" ");
  const area = `${line("views")} L${x(series.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)}Z`;
  const grid = [0, 1, 2, 3, 4].map((i) => { const v = (niceMax / 4) * i; return `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(110,150,255,.14)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" fill="#8da2d3" font-size="11">${fmt(Math.round(v))}</text>`; }).join("");
  const step = Math.ceil(series.length / 7);
  const labels = series.map((d, i) => (i % step === 0 || i === series.length - 1 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" fill="#8da2d3" font-size="11">${d.day.slice(5)}</text>` : "")).join("");
  const dots = series.map((d, i) => `<rect class="hit" x="${x(i) - (W / series.length) / 2}" y="0" width="${W / series.length}" height="${H}" fill="transparent" data-i="${i}"/>`).join("");
  return `<div style="position:relative"><svg id="ch" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
    <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b86ff" stop-opacity=".5"/><stop offset="1" stop-color="#5b86ff" stop-opacity="0"/></linearGradient></defs>
    ${grid}${labels}<path d="${area}" fill="url(#ga)"/><path id="ln" d="${line("views")}" fill="none" stroke="#7ea2ff" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 6px #4a7bff);stroke-dasharray:3000;stroke-dashoffset:3000;animation:dash2 1.4s .1s forwards"/>
    <path d="${line("visitors")}" fill="none" stroke="#a78bfa" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>
    <circle id="dot" r="5" fill="#fff" stroke="#5b86ff" stroke-width="3" style="display:none"/>${dots}</svg>
    <div id="tip" class="toast" style="position:absolute;display:none;pointer-events:none;width:auto;padding:8px 12px;font-size:12px;flex-direction:column;gap:2px"></div></div>
    <div class="row" style="gap:16px;font-size:12px;color:var(--muted);margin-top:6px"><span><b style="color:#7ea2ff">━</b> Page views</span><span><b style="color:#a78bfa">┅</b> Unique visitors</span></div>
    <style>@keyframes dash2{to{stroke-dashoffset:0}}</style>`;
}
function bars(list, total) {
  return list.length ? list.map((r) => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</span><b>${fmt(r.views)}</b></div><div class="bar"><i style="width:0" data-w="${Math.round((r.views / Math.max(1, total)) * 100)}%"></i></div></div>`).join("") : '<div class="empty" style="padding:20px">No data in this period yet.</div>';
}
function render() {
  const d = data, t = d.totals, empty = d.totals.allTimeViews === 0;
  const devTotal = d.devices.desktop + d.devices.mobile + d.devices.tablet;
  const dev = [["desktop", "Desktop", icons.desktop], ["mobile", "Mobile", icons.mobile], ["tablet", "Tablet", icons.tablet]].map(([k, l, ic]) => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px"><span style="display:flex;gap:8px;align-items:center">${ic}${l}</span><b>${fmt(d.devices[k])} <span style="color:var(--muted);font-weight:500">${devTotal ? Math.round((d.devices[k] / devTotal) * 100) : 0}%</span></b></div><div class="bar"><i style="width:0" data-w="${devTotal ? Math.round((d.devices[k] / devTotal) * 100) : 0}%"></i></div></div>`).join("");
  $("root").innerHTML = `
    <div class="eyebrow">Analytics</div><h1 style="margin-bottom:6px">${esc(d.site.title || d.site.path)}</h1>
    <div class="sub" style="margin-bottom:14px"><a class="link" target="_blank" rel="noopener" href="/${encodeURIComponent(d.site.path)}">/${esc(d.site.path)}</a> · ${d.last ? `last visit <b>${ago(d.last.at)}</b> on <code>${esc(d.last.page)}</code>` : "no visits recorded yet"}</div>
    <div class="row" style="margin-bottom:16px;align-items:center">
      ${[7, 30, 90].map((n) => `<button class="btn sm ${range.days === n && !range.from ? "primary" : "outline"}" data-d="${n}">${n} days</button>`).join("")}
      <input type="date" class="inp" id="rf" style="width:auto" value="${d.range.from}" max="${d.range.to}"><span style="color:var(--muted)">→</span><input type="date" class="inp" id="rt" style="width:auto" value="${d.range.to}">
      <button class="btn sm outline" id="rgo">Apply</button><a class="btn sm ghost" href="/dashboard.html">${icons.back} Back</a></div>
    ${empty ? `<div class="alert info"><b>${icons.sparkle} Waiting for your first visitor</b><span>Counts appear as soon as someone opens your published site. Only real visits are recorded — nothing here is simulated.</span></div>` : ""}
    <div class="stats">
      <div class="card stat reveal"><small>Page views</small><b data-c="${t.views}">0</b>${pct(d.growth.views)}</div>
      <div class="card stat reveal"><small>Unique visitors</small><b data-c="${t.visitors}">0</b>${pct(d.growth.visitors)}</div>
      <div class="card stat reveal"><small>Today</small><b data-c="${d.today.visitors}">0</b><em style="color:var(--muted)">${fmt(d.today.views)} views</em></div>
      <div class="card stat reveal"><small>Last 7 days</small><b data-c="${d.week.visitors}">0</b><em style="color:var(--muted)">${fmt(d.week.views)} views</em></div>
      <div class="card stat reveal"><small>Last 30 days</small><b data-c="${d.month.visitors}">0</b><em style="color:var(--muted)">${fmt(d.month.views)} views</em></div>
      <div class="card stat reveal"><small>All-time views</small><b data-c="${t.allTimeViews}">0</b><em style="color:var(--muted)">${fmt(t.allTimeVisitors)} visitors</em></div>
    </div>
    <div class="card reveal"><div class="card-h"><span>Traffic growth</span><span class="chip">${d.range.from} → ${d.range.to}</span></div><div class="card-b">${chart(d.series)}</div></div>
    <div class="edgrid">
      <div class="card reveal"><div class="card-h">Most visited pages</div><div class="card-b">${bars(d.pages, Math.max(1, ...d.pages.map((p) => p.views)))}</div></div>
      <div class="card reveal"><div class="card-h">Referral sources</div><div class="card-b">${bars(d.referrers, Math.max(1, ...d.referrers.map((p) => p.views)))}</div></div>
    </div>
    <div class="card reveal"><div class="card-h">Devices</div><div class="card-b">${devTotal ? dev : '<div class="empty" style="padding:20px">No data in this period yet.</div>'}</div></div>
    <p class="sub" style="text-align:center">${esc(d.note)}</p>`;
  document.querySelectorAll("[data-c]").forEach((e) => countUp(e, +e.dataset.c));
  setTimeout(() => document.querySelectorAll("[data-w]").forEach((e) => (e.style.width = e.dataset.w)), 80);
  document.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { range = { days: +b.dataset.d }; load(); }));
  $("rgo").onclick = () => { const f = $("rf").value, t2 = $("rt").value; if (!f || !t2) return toast("Pick both dates", "err"); range = { from: f, to: t2 }; load(); };
  const ch = $("ch"), tip = $("tip"), dot = $("dot");
  if (ch) ch.addEventListener("pointermove", (e) => {
    const h = e.target.closest(".hit"); if (!h) return; const i = +h.dataset.i, p = d.series[i], r = ch.getBoundingClientRect(), sx = r.width / 760;
    const cx = parseFloat(h.getAttribute("x")) + parseFloat(h.getAttribute("width")) / 2, cy = 14 + (1 - p.views / Math.max(1, ...d.series.map((s) => s.views), 4)) * 200;
    dot.setAttribute("cx", cx); dot.setAttribute("cy", Math.min(214, cy)); dot.style.display = "block";
    tip.style.display = "flex"; tip.innerHTML = `<b>${p.day}</b><span>${fmt(p.views)} views · ${fmt(p.visitors)} visitors</span>`;
    tip.style.left = Math.min(r.width - 150, Math.max(0, cx * sx - 60)) + "px"; tip.style.top = "0px";
  });
}
async function load() {
  $("root").innerHTML = miniLoader("Loading analytics…");
  try { data = await analytics({ key, ...range }); render(); }
  catch (e) { $("root").innerHTML = `<div class="status show err">${esc(e.message)}</div><div class="row" style="margin-top:12px"><button class="btn outline" id="rt1">Retry</button><a class="btn ghost" href="/dashboard.html">Back</a></div>`; $("rt1").onclick = load; }
}
onAuthStateChanged(auth, async (u) => {
  if (!u) return (location.href = "/login.html?next=" + encodeURIComponent(location.pathname + location.search));
  if (!key) return (location.href = "/dashboard.html");
  setAvatar(u); await load(); hideLoader();
});
