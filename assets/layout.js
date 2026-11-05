// Shared shell: header with hamburger menu (like InfinityFree), loader, icons.
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
};

const LOGO = `<svg viewBox="0 0 38 24" fill="none" stroke="#7a35c9" stroke-width="4.5" stroke-linecap="round"><path d="M19 12c-3-5-5-8-9-8a8 8 0 0 0 0 16c4 0 6-3 9-8s5-8 9-8a8 8 0 0 1 0 16c-4 0-6-3-9-8z"/></svg>`;
const BURGER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`;

const PUBLIC = [
  ["/", "Home", "home"],
  ["/login.html", "Log in", "key"],
  ["/register.html", "Sign up", "plus"],
];
const APP = [
  ["/dashboard.html", "My websites", "globe"],
  ["/create.html", "Create website", "plus"],
  ["/api-key.html", "API key", "key"],
  ["/api-docs.html", "API documentation", "code"],
];

export function mountHeader(kind = "public", onLogout) {
  const links = kind === "app" ? APP : PUBLIC;
  const here = location.pathname === "/" ? "/" : location.pathname;
  const h = document.createElement("header");
  h.className = "hdr";
  h.innerHTML = `
    <div class="hdr-in">
      <a class="brand" href="/">${LOGO}Webora</a>
      <div class="hdr-r">
        ${kind === "app" ? `<div class="avatar" id="avatar">…</div>` : ""}
        <button class="burger" id="burger" aria-label="Menu">${BURGER}</button>
      </div>
    </div>
    <nav class="drawer" id="drawer"><div class="drawer-in">
      ${links.map(([href, label, ic]) => `<a href="${href}" class="${here === href ? "on" : ""}">${icons[ic]}${label}</a>`).join("")}
      ${kind === "app" ? `<a href="#" id="logoutLink">${icons.out}Log out</a>` : ""}
    </div></nav>`;
  document.body.prepend(h);
  document.getElementById("burger").onclick = () => document.getElementById("drawer").classList.toggle("open");
  const lo = document.getElementById("logoutLink");
  if (lo) lo.onclick = (e) => { e.preventDefault(); onLogout && onLogout(); };
}

export function setAvatar(user) {
  const el = document.getElementById("avatar");
  if (!el) return;
  const src = user.displayName || user.email || "?";
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  el.textContent = ((parts[0] || "?")[0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

export function mountLoader(label = "Loading…") {
  if (document.getElementById("webora-loader")) return;
  const el = document.createElement("div");
  el.id = "webora-loader";
  el.innerHTML = `<svg class="loader-ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14"/></svg><div class="loader-text">${label}</div>`;
  document.body.appendChild(el);
}
export function hideLoader() {
  const el = document.getElementById("webora-loader");
  if (!el) return;
  el.classList.add("hide");
  setTimeout(() => el.remove(), 400);
}
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (id) => document.getElementById(id);
export function status(id, msg, type = "info") {
  const e = document.getElementById(id);
  e.textContent = msg;
  e.className = "status show " + type;
}
