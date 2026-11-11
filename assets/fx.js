// Visual effects: particles, scroll bar, reveal-on-scroll, pointer glow, ripple, count-up.
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

function particles() {
  return; // disabled in the Wevlo theme
  if (reduce || document.getElementById("fx-canvas")) return;
  const c = document.createElement("canvas"); c.id = "fx-canvas"; document.body.prepend(c);
  const x = c.getContext("2d"); let w, h, dots = [];
  const N = () => Math.min(70, Math.floor((w * h) / 22000));
  const size = () => { w = c.width = innerWidth; h = c.height = innerHeight; dots = Array.from({ length: N() }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.6 + .4, vx: (Math.random() - .5) * .18, vy: -(Math.random() * .35 + .08), a: Math.random() * .6 + .2 })); };
  size(); addEventListener("resize", size);
  let last = 0;
  (function tick(t) {
    requestAnimationFrame(tick);
    if (document.hidden || t - last < 33) return; last = t;
    x.clearRect(0, 0, w, h);
    for (const d of dots) {
      d.x += d.vx; d.y += d.vy; if (d.y < -4) { d.y = h + 4; d.x = Math.random() * w; } if (d.x < -4) d.x = w + 4; if (d.x > w + 4) d.x = -4;
      x.beginPath(); x.arc(d.x, d.y, d.r, 0, 6.283); x.fillStyle = `rgba(150,185,255,${d.a})`; x.shadowColor = "#5b86ff"; x.shadowBlur = 10; x.fill();
    }
  })(0);
}

function scrollbar() {
  return; // disabled in the Wevlo theme
  if (document.querySelector(".scrollbar")) return;
  const s = document.createElement("div"); s.className = "scrollbar"; s.innerHTML = "<i></i>"; document.body.appendChild(s);
  const i = s.firstChild;
  const upd = () => { const max = document.documentElement.scrollHeight - innerHeight; s.style.display = max > 80 ? "block" : "none"; const p = max > 0 ? scrollY / max : 0; i.style.top = p * (s.clientHeight - i.clientHeight) + "px"; };
  addEventListener("scroll", upd, { passive: true }); addEventListener("resize", upd); setInterval(upd, 1500); upd();
}

let io;
export function reveal(root = document) {
  const els = [...root.querySelectorAll(".reveal:not(.in)")];
  if (!els.length) return;
  if (reduce || !("IntersectionObserver" in window)) return els.forEach((e) => e.classList.add("in"));
  io = io || new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .08, rootMargin: "0px 0px -30px 0px" });
  els.forEach((e, i) => { if (!e.style.getPropertyValue("--d")) e.style.setProperty("--d", (i % 6) * 0.07 + "s"); io.observe(e); });
}

export function countUp(el, to, ms = 900) {
  to = Number(to) || 0; if (reduce || to === 0) { el.textContent = to.toLocaleString(); return; }
  const t0 = performance.now();
  (function f(t) { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e).toLocaleString(); if (k < 1) requestAnimationFrame(f); })(t0);
}

function pointerGlow() {
  document.addEventListener("pointermove", (e) => {
    const c = e.target.closest && e.target.closest(".card"); if (!c) return;
    const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px");
  }, { passive: true });
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest && e.target.closest(".btn"); if (!b || b.disabled) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height), s = document.createElement("span");
    s.className = "ripple"; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(s); setTimeout(() => s.remove(), 650);
  });
}

export function initFx({ background = true } = {}) {
  if (background) { particles(); scrollbar(); }
  pointerGlow(); reveal();
  new MutationObserver(() => reveal()).observe(document.body, { childList: true, subtree: true });
}
