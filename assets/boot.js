/* Webora boot: runs synchronously right after <body> opens so the animated
   logo loader + animated background appear instantly (before any module loads). */
(function () {
  // Apply the saved theme before anything paints (no flash of the wrong theme).
  try {
    var saved = localStorage.getItem("webora:theme");
    document.documentElement.setAttribute("data-theme", saved === "dark" ? "dark" : "light");
  } catch (e) { /* storage unavailable — defaults to light */ }

  // Reliable viewport height on mobile browsers: `100dvh` isn't trustworthy
  // everywhere yet (some mobile WebViews report 0/garbage on first paint,
  // which is what made Studio's Code/Preview panes collapse to nothing on
  // phones). We compute a real `--vh` (1% of the *visual* viewport) in JS and
  // keep it current; CSS falls back to it anywhere `100dvh` is used.
  function setVh() {
    var h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    document.documentElement.style.setProperty("--vh", h * 0.01 + "px");
  }
  setVh();
  addEventListener("resize", setVh);
  addEventListener("orientationchange", setVh);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", setVh);
  var n = 0;
  var WP = "M33 40 L45 76 L60 52 L75 76 L87 40";

  // ── Webora emblem: glossy gradient badge + ribbon "W" + glowing node + orbit ring.
  // cls: "anim" (pop-in, W draws itself, shine sweep, pulse, orbiting spark) or "static".
  window.WeboraLogo = function (cls) {
    var i = ++n, anim = /\banim\b/.test(cls || "");
    return '<svg xmlns="http://www.w3.org/2000/svg" class="wx ' + (anim ? "anim" : "static") + '" viewBox="' + (anim ? "0 0 120 120" : "10 10 100 100") + '" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-label="Webora">' +
      '<defs>' +
      '<linearGradient id="wxB' + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset=".5" stop-color="#6d3df0"/><stop offset="1" stop-color="#3a1fc2"/></linearGradient>' +
      '<linearGradient id="wxW' + i + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#e3d9ff"/></linearGradient>' +
      (anim ? '<linearGradient id="wxS' + i + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' : '') +
      '<clipPath id="wxC' + i + '"><rect x="14" y="14" width="92" height="92" rx="28"/></clipPath>' +
      '</defs>' +
      '<g class="pop"><g class="br">' +
        '<rect x="14" y="14" width="92" height="92" rx="28" fill="url(#wxB' + i + ')" stroke="none"/>' +
        '<g clip-path="url(#wxC' + i + ')">' +
          '<path d="M14 62 V44 Q14 14 44 14 H76 Q106 14 106 44 V62 Q60 78 14 62Z" fill="#fff" fill-opacity=".13" stroke="none"/>' +
          (anim ? '<g class="sh"><rect x="0" y="0" width="28" height="120" fill="url(#wxS' + i + ')" stroke="none" transform="skewX(-20)"/></g>' : '') +
        '</g>' +
        '<rect x="14.5" y="14.5" width="91" height="91" rx="27.5" stroke="#fff" stroke-opacity=".22" stroke-width="1"/>' +
        '<path class="w2" d="' + WP + '" transform="translate(0 3.5)" stroke="#1b0a6b" stroke-opacity=".35" stroke-width="10.5" pathLength="100"/>' +
        '<path class="w1" d="' + WP + '" stroke="url(#wxW' + i + ')" stroke-width="10" pathLength="100"/>' +
        (anim ? '<circle class="rg" cx="60" cy="52" r="5" stroke="#67e8f9" stroke-width="1.6"/>' : '') +
        '<circle class="nd" cx="60" cy="52" r="4.4" fill="#22d3ee" stroke="#fff" stroke-width="2"/>' +
      '</g></g>' +
      (anim ? '<g class="orb"><circle cx="60" cy="60" r="56.5" stroke="#8b5cf6" stroke-opacity=".35" stroke-width="1.6" stroke-dasharray="70 285"/>' +
        '<circle cx="60" cy="60" r="56.5" stroke="#22d3ee" stroke-width="2.4" stroke-dasharray="26 329" stroke-dashoffset="-44"/>' +
        '<circle cx="78.4" cy="113.4" r="3" fill="#22d3ee" stroke="none"/></g>' : '') +
      '</svg>';
  };

  // ── styles for the logo + loader (injected here so every page gets them)
  var css = document.createElement("style");
  css.id = "wx-css";
  css.textContent =
    '.wx{display:block;width:100%;height:auto;aspect-ratio:1;overflow:visible;filter:drop-shadow(0 3px 6px rgba(91,33,230,.32))}' +
    '.wx.anim{filter:drop-shadow(0 10px 20px rgba(91,33,230,.38))}' +
    '.brand .wx{width:40px;flex:none}.st-top .brand .wx{width:34px}.pv-load .wx{width:64px}' +
    '.hero-logo.wx{width:min(150px,40vw);height:auto;margin:0 auto 6px}' +
    '.wx.anim .pop{transform-origin:60px 60px;animation:wxPop .45s cubic-bezier(.2,1.35,.4,1) both}' +
    '.wx.anim .br{transform-origin:60px 60px;animation:wxBr 2.6s ease-in-out .5s infinite}' +
    '.wx.anim .w1,.wx.anim .w2{stroke-dasharray:100 200;stroke-dashoffset:100;animation:wxDraw .5s cubic-bezier(.3,.7,.2,1) .15s forwards}' +
    '.wx.anim .w2{animation-delay:.22s}' +
    '.wx.anim .nd{transform-origin:60px 52px;transform:scale(0);animation:wxNode .35s cubic-bezier(.2,1.8,.4,1) .6s forwards}' +
    '.wx.anim .rg{transform-origin:60px 52px;opacity:0;animation:wxRing 1.7s ease-out .9s infinite}' +
    '.wx.anim .sh{animation:wxShine 2.4s ease-in-out .8s infinite}' +
    '.wx.anim .orb{transform-origin:60px 60px;opacity:0;animation:wxSpin 2.2s linear infinite,wxFade .3s ease .3s forwards;filter:drop-shadow(0 0 3px rgba(34,211,238,.7))}' +
    '@keyframes wxPop{from{opacity:0;transform:scale(.35) rotate(-14deg)}to{opacity:1;transform:none}}' +
    '@keyframes wxBr{50%{transform:translateY(-2px) scale(1.025)}}' +
    '@keyframes wxDraw{to{stroke-dashoffset:0}}' +
    '@keyframes wxNode{to{transform:scale(1)}}' +
    '@keyframes wxRing{from{opacity:.85;transform:scale(1)}to{opacity:0;transform:scale(3.2)}}' +
    '@keyframes wxShine{0%{transform:translateX(-30px)}60%,100%{transform:translateX(190px)}}' +
    '@keyframes wxSpin{to{transform:rotate(360deg)}}' +
    '@keyframes wxFade{to{opacity:1}}' +
    /* loader */
    '#webora-loader{background:radial-gradient(55% 45% at 50% 40%,rgba(139,92,246,.18),transparent 72%),var(--bg);gap:0}' +
    '.wl-stage{width:112px;margin-bottom:10px;transition:transform .25s ease}' +
    '#webora-loader.hide .wl-stage{transform:scale(1.18)}' +
    '.wl-name{display:flex;font:800 24px var(--font-d);letter-spacing:-.03em;color:var(--ink)}' +
    '.wl-name span{display:inline-block;opacity:0;animation:wlLet .45s cubic-bezier(.2,.8,.2,1) calc(.45s + var(--i)*.06s) forwards}' +
    '.wl-name .g{background:linear-gradient(90deg,#4318d8,#8b5cf6);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}' +
    '.wl-bar{width:120px;height:4px;border-radius:4px;background:var(--soft);overflow:hidden;position:relative;margin:16px 0 10px}' +
    '.wl-bar i{position:absolute;top:0;bottom:0;width:40%;border-radius:4px;background:linear-gradient(90deg,#4318d8,#8b5cf6);animation:wlBar 1s ease-in-out infinite}' +
    '.wl-text{font:600 12px var(--font-d);color:var(--muted);letter-spacing:.02em}' +
    '@keyframes wlLet{from{opacity:0;transform:translateY(8px);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}' +
    '@keyframes wlBar{from{left:-40%}to{left:100%}}';
  document.head.appendChild(css);

  // Same markup is used by boot.js and layout.js → one loader everywhere.
  window.WeboraLoaderHTML = function (label) {
    var name = "Webora".split("").map(function (c, k) {
      return '<span class="' + (k >= 3 ? "g" : "") + '" style="--i:' + k + '">' + c + "</span>";
    }).join("");
    return '<div class="wl-stage">' + window.WeboraLogo("anim") + '</div><div class="wl-name" aria-hidden="true">' + name +
      '</div><div class="wl-bar"><i></i></div><div class="wl-text" id="ld-text">' + label + "</div>";
  };

  // Favicon = the same emblem.
  try {
    Array.prototype.forEach.call(document.querySelectorAll('link[rel~="icon"]'), function (l) { l.remove(); });
    var fav = document.createElement("link");
    fav.rel = "icon"; fav.type = "image/svg+xml";
    fav.href = "data:image/svg+xml," + encodeURIComponent(window.WeboraLogo("static"));
    document.head.appendChild(fav);
  } catch (e) { /* ignore */ }

  var s = document.currentScript;
  var label = (s && s.getAttribute("data-label")) || "Loading…";
  var el = document.createElement("div");
  el.id = "webora-loader";
  el.innerHTML = window.WeboraLoaderHTML(label);
  document.body.insertBefore(el, document.body.firstChild);
  setTimeout(function () {
    var t = document.getElementById("ld-text");
    if (t) t.textContent = "Still loading… check your connection";
  }, 7000);
})();

/* Adsterra on app pages (not on login/register). Social bar + popunder. */
(function () {
  if (/^\/auth\//.test(location.pathname)) return;
  ["https://pl31982276.profitableratecpmnetwork.com/12/3e/a4/123ea4b096204a3ff2aebea2d0927b44.js",
   "https://pl32003609.profitableratecpmnetwork.com/dd/bb/71/ddbb712826a2a0ef0466cf584a6f7ef7.js"].forEach(function (u) {
    var s = document.createElement("script"); s.src = u; s.async = true; document.body.appendChild(s);
  });
})();
