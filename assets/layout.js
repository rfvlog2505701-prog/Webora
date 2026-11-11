// Shared shell: animated header (pill nav + mobile drawer), loader, toasts, modals, icons.
import { initFx } from "/assets/fx.js";
export const icons = {
  google: `<svg class="icon" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.4H12v4.5h6.5c-.3 1.5-1.2 2.8-2.5 3.7v3h4C22.3 19 23.5 15.9 23.5 12.3z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-4-3c-1.1.7-2.5 1.2-3.9 1.2-3 0-5.5-2-6.4-4.7h-4.1v3C3.6 21.3 7.5 24 12 24z"/><path fill="#FBBC05" d="M5.6 14.6c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1v-3h-4.1C.5 9 0 10.5 0 12.1s.5 3.1 1.5 4.6z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.5 0 3.6 2.7 1.5 6.6l4.1 3C6.5 6.8 9 4.8 12 4.8z"/></svg>`,
  globe: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"/></svg>`,
  plus: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  key: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="12" r="4"/><path d="M11.5 12H21M17 12v3M20 12v3"/></svg>`,
  code: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>`,
  home: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>`,
  out: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/></svg>`,
  warn: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3L2 20h20z"/><path d="M12 10v4M12 17v.5"/></svg>`,
  ext: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`,
  spinner: `<svg class="icon spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="45"/></svg>`,
  folder: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
  file: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`,
  upload: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>`,
  download: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>`,
  chart: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>`,
  history: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2"/></svg>`,
  sparkle: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2zM19 3v4M17 5h4"/></svg>`,
  eye: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  save: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/></svg>`,
  search: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>`,
  trash: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`,
  edit: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/></svg>`,
  x: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  check: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>`,
  refresh: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>`,
  desktop: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>`,
  tablet: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/></svg>`,
  mobile: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 19h2"/></svg>`,
  full: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
  rocket: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c4 2.5 6 6.5 5 12H7c-1-5.500 1-9.500 5-12zM7 15l-3 4 4-1M17 15l3 4-4-1M12 10h.01"/></svg>`,
  newfile: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14h6"/></svg>`,
  newfolder: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v6M9 13h6"/></svg>`,
  zip: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/></svg>`,
  back: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  more: `<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`,
  docs: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8 13h8M8 17h8M8 9h3"/></svg>`,
};


const logoHtml = () => (window.WeboraLogo ? window.WeboraLogo("static") : "");
const BURGER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`;
const SUN = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19v2.4M4.5 12H2M22 12h-2.5M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7"/></svg>`;
const MOON = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 13.2A9 9 0 1 1 10.8 3a7 7 0 0 0 10.2 10.2z"/></svg>`;

// ── theme (dark/light) — boot.js applies the saved choice before first paint;
// this just handles the toggle button + persisting the choice.
export function currentTheme() { return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }
export function setTheme(t) {
  t = t === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("webora:theme", t); } catch (e) { /* ignore */ }
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => (b.innerHTML = t === "light" ? MOON : SUN));
}
export function mountThemeToggle(container) {
  const b = document.createElement("button");
  b.className = "ib theme-toggle"; b.type = "button"; b.setAttribute("data-theme-toggle", "");
  b.title = "Switch theme"; b.setAttribute("aria-label", "Switch between light and dark theme");
  b.innerHTML = currentTheme() === "light" ? MOON : SUN;
  b.onclick = () => setTheme(currentTheme() === "light" ? "dark" : "light");
  container.appendChild(b);
  return b;
}

const PUBLIC = [
  ["/", "Home", "home"],
  ["/auth/login", "Log in", "key"],
  ["/auth/register", "Sign up", "plus"],
];
const APP = [
  ["/app/dashboard", "My websites", "globe"],
  ["/app/create", "Create", "plus"],
  ["/app/ai", "AI Generator", "sparkle"],
  ["/app/api-key", "API key", "key"],
  ["/app/api-docs", "API docs", "code"],
];

export function mountHeader(kind = "public", onLogout) {
  const links = kind === "app" ? APP : PUBLIC;
  const here = location.pathname === "/" ? "/" : location.pathname;
  const on = (href) => (here === href ? "on" : "");
  const h = document.createElement("header");
  h.className = "hdr";
  h.innerHTML = `
    <div class="hdr-in">
      <div class="hdr-l"><button class="burger" id="burger" aria-label="Menu">${BURGER}</button>
      <a class="brand" href="${kind === "app" ? "/app/dashboard" : "/"}">${logoHtml()}<span>Webora</span></a></div>
      <nav class="pillnav">${links.map(([href, label, ic]) => `<a href="${href}" class="${on(href)}">${icons[ic]}${label}</a>`).join("")}</nav>
      <div class="hdr-r"><span id="themeSlot"></span>
        ${kind === "app" ? `<div class="avatar" id="avatar" role="button" tabindex="0" aria-label="Account">…</div>` : ""}
      </div>
    </div>
    ${kind === "app" ? `<div class="umenu" id="umenu"><a href="/app/api-key">${icons.key}API key</a><a href="#" id="logoutLink">${icons.out}Log out</a></div>` : ""}`;
  document.body.prepend(h);
  const ov = document.createElement("div");
  ov.className = "nav-ov"; ov.id = "navov";
  ov.innerHTML = `<nav class="nav-panel"><div class="nav-top"><a class="brand" href="${kind === "app" ? "/app/dashboard" : "/"}" style="padding:0">${logoHtml()}<span>Webora</span></a><button class="ib" id="navx" aria-label="Close">${icons.x}</button></div>
    ${links.map(([href, label, ic]) => `<a href="${href}" class="${on(href)}">${icons[ic]}${label}</a>`).join("")}
    ${kind === "app" ? `<a href="/app/analytics" class="${on("/app/analytics")}">${icons.chart}Analytics</a><div class="nav-sep"></div><a href="#" id="logoutLink2">${icons.out}Log out</a>` : ""}</nav>`;
  document.body.appendChild(ov);
  const close = () => ov.classList.remove("open");
  document.getElementById("burger").onclick = () => ov.classList.add("open");
  document.getElementById("navx").onclick = close;
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  mountThemeToggle(h.querySelector("#themeSlot"));
  const lo = (e) => { e.preventDefault(); onLogout && onLogout(); };
  [document.getElementById("logoutLink"), document.getElementById("logoutLink2")].forEach((el) => el && (el.onclick = lo));
  const av = document.getElementById("avatar"), um = document.getElementById("umenu");
  if (av) {
    av.onclick = (e) => { e.stopPropagation(); um.classList.toggle("open"); };
    document.addEventListener("click", () => um.classList.remove("open"));
  }
  if (kind === "app") {
    const nav = document.createElement("nav");
    nav.className = "bnav";
    nav.innerHTML = [["/app/dashboard", "Home", "home"], ["/app/create", "Create", "plus"], ["/app/ai", "AI", "sparkle"], ["/app/api-key", "API", "key"]]
      .map(([href, label, ic]) => `<a href="${href}" class="${on(href)}">${icons[ic]}${label}</a>`).join("");
    document.body.appendChild(nav);
    document.body.classList.add("has-bnav");
  }
  initFx();
}

export function setAvatar(user) {
  const el = document.getElementById("avatar");
  if (!el) return;
  const src = user.displayName || user.email || "?";
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  el.textContent = ((parts[0] || "?")[0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

// ── loader panel (animated Webora logo). boot.js injects it instantly; these keep the old API.
const T0 = performance.now();
export function mountLoader(label = "Loading…") {
  let el = document.getElementById("webora-loader");
  if (el) { const t = el.querySelector(".loader-text"); if (t) t.textContent = label; el.classList.remove("hide"); return el; }
  el = document.createElement("div");
  el.id = "webora-loader";
  el.innerHTML = `<div class="ld-stage"><div class="ld-glow"></div>${window.WeboraLogo ? window.WeboraLogo("anim") : ""}</div><div class="ld-bar"><i></i></div><div class="loader-text">${label}</div>`;
  document.body.appendChild(el);
  return el;
}
export function hideLoader() {
  const el = document.getElementById("webora-loader");
  if (!el) return;
  const wait = Math.max(0, 250 - (performance.now() - T0)); // let the logo draw-in finish once
  setTimeout(() => { el.classList.add("hide"); setTimeout(() => el.remove(), 250); }, wait);
}
// small inline loader for panels (re-uses the animated logo)
export const miniLoader = (label = "Loading…") => `<div class="empty"><div style="width:70px;margin:0 auto 8px">${window.WeboraLogo ? window.WeboraLogo("anim") : ""}</div>${label}</div>`;

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (id) => document.getElementById(id);
export function status(id, msg, type = "info") {
  const e = document.getElementById(id);
  e.textContent = msg;
  e.className = "status show " + type;
}

// ── toasts
export function toast(msg, type = "info", ms = 3200) {
  let box = document.getElementById("toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.innerHTML = `${type === "ok" ? icons.check : type === "err" ? icons.warn : icons.sparkle}<span></span>`;
  t.querySelector("span").textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, ms);
}

// ── modal helpers (promise based)
export function modal({ title, body = "", actions = [], onMount }) {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="card modal" role="dialog" aria-modal="true"><div class="card-h"><span>${esc(title)}</span><button class="btn sm ghost" data-x aria-label="Close">${icons.x}</button></div><div class="card-b">${body}<div class="row" style="margin-top:14px;justify-content:flex-end" data-actions></div></div></div>`;
    const done = (v) => { bg.remove(); document.removeEventListener("keydown", esc_); resolve(v); };
    const esc_ = (e) => { if (e.key === "Escape") done(null); };
    document.addEventListener("keydown", esc_);
    bg.addEventListener("mousedown", (e) => { if (e.target === bg) done(null); });
    bg.querySelector("[data-x]").onclick = () => done(null);
    const act = bg.querySelector("[data-actions]");
    for (const a of actions) {
      const b = document.createElement("button");
      b.className = "btn " + (a.cls || "outline"); b.textContent = a.label;
      b.onclick = () => { if (a.keep) { a.onClick && a.onClick(bg, done); } else done(a.value !== undefined ? a.value : a.label); };
      act.appendChild(b);
    }
    document.body.appendChild(bg);
    if (onMount) onMount(bg, done);
    const f = bg.querySelector("input,textarea,select"); if (f) f.focus();
  });
}
export const confirmBox = (title, text, okLabel = "Confirm", danger = false) =>
  modal({ title, body: `<p>${esc(text)}</p>`, actions: [{ label: "Cancel", value: false }, { label: okLabel, cls: danger ? "danger" : "primary", value: true }] }).then((v) => v === true);
export const promptBox = (title, label, value = "", okLabel = "OK") =>
  modal({
    title, body: `<div class="field" style="margin:0"><label>${esc(label)}</label><input id="__pv" value="${esc(value)}" maxlength="120"></div>`,
    actions: [{ label: "Cancel", value: null }, { label: okLabel, cls: "primary", keep: true, onClick: (bg, done) => done(bg.querySelector("#__pv").value) }],
    onMount: (bg, done) => { const i = bg.querySelector("#__pv"); i.select(); i.addEventListener("keydown", (e) => { if (e.key === "Enter") done(i.value); }); },
  });
