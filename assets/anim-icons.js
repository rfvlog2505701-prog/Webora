// Animated SVG icons shown inside an "orbit" ring (same look as the reference video).
const I = {
  web: `<rect class="fill" x="6" y="12" width="52" height="38" rx="6"/><path d="M6 22h52"/><circle cx="12" cy="17" r="1.2" class="acc"/><circle cx="17" cy="17" r="1.2"/><rect class="fill" x="14" y="28" width="26" height="8" rx="2"/><path class="draw" d="M14 43h22M14 47h14"/><g class="rot"><circle cx="50" cy="14" r="7" class="acc"/><path d="M43 14h14M50 7v14"/></g>`,
  zip: `<path class="fill" d="M32 8l22 12v24L32 56 10 44V20z"/><path d="M10 20l22 12 22-12M32 32v24"/><g class="blink"><path class="acc" d="M32 0v14M26 9l6 6 6-6"/></g>`,
  code: `<rect class="fill" x="6" y="10" width="52" height="44" rx="7"/><path class="draw acc" d="M24 24l-8 8 8 8"/><path class="draw acc" d="M40 24l8 8-8 8"/><path d="M35 22l-6 20"/>`,
  ai: `<rect class="fill" x="14" y="20" width="36" height="28" rx="9"/><path d="M32 20v-8"/><circle cx="32" cy="10" r="2.6" class="acc"/><circle class="blink acc" cx="24" cy="33" r="3"/><circle class="blink acc" cx="40" cy="33" r="3"/><path class="draw" d="M25 42h14"/><path d="M8 32v8M56 32v8"/><path class="rot" d="M52 8l1.5 3.5L57 13l-3.5 1.5L52 18l-1.5-3.5L47 13l3.5-1.5z"/>`,
  chart: `<rect class="fill" x="6" y="8" width="52" height="46" rx="7"/><g class="bars"><rect class="fill acc" x="14" y="34" width="6" height="14" rx="1.5"/><rect class="fill acc" x="25" y="26" width="6" height="22" rx="1.5"/><rect class="fill acc" x="36" y="30" width="6" height="18" rx="1.5"/><rect class="fill acc" x="47" y="18" width="6" height="30" rx="1.5"/></g>`,
  history: `<circle class="fill" cx="32" cy="32" r="22"/><path class="draw acc" d="M32 18v14l9 6"/><path d="M10 32a22 22 0 0 1 4-12M10 18v6h6"/>`,
  rocket: `<path class="fill" d="M32 6c9 6 13 16 11 30H21C19 22 23 12 32 6z"/><circle cx="32" cy="24" r="4.5" class="acc"/><path d="M21 36l-8 9 10-1M43 36l8 9-10-1"/><g class="blink"><path class="acc" d="M28 44c0 6 4 12 4 12s4-6 4-12"/></g>`,
  key: `<circle class="fill" cx="22" cy="32" r="12"/><circle cx="22" cy="32" r="4" class="acc"/><path class="draw" d="M34 32h24M50 32v8M57 32v6"/>`,
  shield: `<path class="fill" d="M32 6l20 7v16c0 14-9 23-20 29C21 52 12 43 12 29V13z"/><rect x="24" y="30" width="16" height="12" rx="2" class="acc fill"/><path class="blink acc" d="M27 30v-4a5 5 0 0 1 10 0v4"/>`,
  folder: `<path class="fill" d="M6 16a4 4 0 0 1 4-4h14l6 7h24a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z"/><path class="draw acc" d="M16 34h32M16 42h20"/>`,
  upload: `<path class="fill" d="M14 40a10 10 0 0 1 3-19 14 14 0 0 1 27 3 8 8 0 0 1 2 16z"/><g class="blink"><path class="acc" d="M32 50V30M24 37l8-8 8 8"/></g>`,
};
export function orbIcon(name, { small = false, dots = true } = {}) {
  return `<div class="orb${small ? " sm" : ""}">${dots && !small ? '<i class="dot"></i><i class="dot d2"></i>' : ""}<svg class="ai" viewBox="0 0 64 64">${I[name] || I.web}</svg></div>`;
}
export const orbNames = Object.keys(I);
