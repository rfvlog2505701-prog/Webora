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
  var D = "M16 15 L40 62 L60 27 L80 62 L104 15";
  // Animated "W" ribbon logo. cls: "anim" (draw-in + moving shine + float) or "static".
  window.WeboraLogo = function (cls) {
    var i = ++n;
    return '<svg class="wlogo ' + (cls || "static") + '" viewBox="0 0 120 80" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-label="Webora">' +
      '<defs><linearGradient id="wgB' + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#5b21b6"/></linearGradient>' +
      '<linearGradient id="wgF' + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" stop-color="#4318d8"/></linearGradient></defs>' +
      '<path class="back" d="' + D + '" transform="translate(5 5)" stroke="url(#wgB' + i + ')" stroke-width="16" pathLength="100"/>' +
      '<path class="front" d="' + D + '" stroke="url(#wgF' + i + ')" stroke-width="15" pathLength="100"/>' +
      '<path class="shine" d="' + D + '" stroke-width="4" pathLength="100"/></svg>';
  };
  var s = document.currentScript;
  var label = (s && s.getAttribute("data-label")) || "Loading…";
    var el = document.createElement("div");
  el.id = "webora-loader";
  el.innerHTML = '<div class="ld-stage"><div class="ld-glow"></div>' + window.WeboraLogo("anim") + '</div><div class="ld-bar"><i></i></div><div class="loader-text" id="ld-text">' + label + "</div>";
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
