/* Every ring is a strip of 2D canvas wrapped around a cylinder. A texture is
   `{ canvas, worldWidth }` — worldWidth is how many *world* units of ring
   circumference one repeat of the strip covers, which is how the UV walker in
   badge.js knows when to tile.

   Everything is drawn at SS× the world size and downsampled by the mipmap chain,
   which is where the crispness comes from. Don't lower it. */

export const SS = 3;

/* DDX brand. [0] accent, [1] soft grey, [2] white, [3] ink, [4] deep accent, [5] grey */
export const PALETTE = ['#FFF204', '#E9E9E9', '#FFFFFF', '#0B0B0B', '#3A3600', '#1C1C1C'];
export const ACCENT = PALETTE[0];
export const INK = '#0B0B0B';
export const CARD_BG = '#101010';

/* The secondary neons from ddxconference.com. Only the random-grid pattern
   reaches for these — they're seasoning, not the palette. */
export const NEONS = ['#00FF96', '#05FBE2', '#5CFD08'];

export const FONT =
  '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';

/* ---------- tiny helpers ---------- */

export const TAU = Math.PI * 2;
export const lerp = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

/* splitmix32 — same stream for the same seed, which is what makes a shuffled
   design reproducible across a re-render and an export. */
export function rngFrom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, n) => Math.floor(rng() * n);

function ctx2d(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c.getContext('2d');
}
function fill(c, color) {
  c.fillStyle = color;
  c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  return c;
}
const tex = (canvas) => ({ canvas, worldWidth: canvas.width / SS });

const rgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/* ---------- content strips ---------- */

/* A band of letter-spaced caps. `spread` pads the strip out beyond the text so
   the words breathe once they're repeated around the ring.

   `fit` is the width of the ring's *visible* arc in world units. A long name on
   a small ring would otherwise wrap past the seam and get chopped mid-word, so
   the padding is spent first and then, if it still doesn't fit, the type is set
   smaller — down to a floor, past which we let it repeat rather than go unreadable. */
export function textStrip(h, text, bg, fg, { spread = 1.32, fit = Infinity } = {}) {
  const s = (text || ' ').toUpperCase();
  const H = h * SS;

  const measure = (size) => {
    const tracking = -size * 0.08;
    const m = ctx2d(1, 1);
    m.font = `300 ${size}px ${FONT}`;
    let w = 0;
    for (let i = 0; i < s.length; i++) {
      w += m.measureText(s[i]).width;
      if (i < s.length - 1) w += tracking;
    }
    return { w, tracking };
  };

  let size = H * 0.7;
  let { w: textW, tracking } = measure(size);
  const fitPx = fit * SS;

  let pad = spread;
  if (textW * spread > fitPx) pad = Math.max(1, fitPx / textW);
  if (textW > fitPx) {
    size *= Math.max(0.72, fitPx / textW);
    ({ w: textW, tracking } = measure(size));
    pad = 1;
  }

  const W = Math.max(textW * pad, 10);
  const c = ctx2d(W, H);
  fill(c, bg);
  c.fillStyle = fg;
  c.font = `300 ${size}px ${FONT}`;
  c.textBaseline = 'middle';

  let x = (W - textW) / 2;
  for (let i = 0; i < s.length; i++) {
    c.fillText(s[i], x, H / 2 + size * 0.04);
    x += c.measureText(s[i]).width + tracking;
  }
  return tex(c.canvas);
}

/* The capsule ring — a thin band that swells into a pill around the label and
   tapers back out to the strip edges, so the repeats read as one ribbon. */
export function capsuleStrip(h, label, bg, pillColor, textColor) {
  const s = (label || ' ').toUpperCase();
  const H = h * SS;
  const pillH = H * 0.68;
  const size = pillH * 0.55;

  const m = ctx2d(1, 1);
  m.font = `500 ${size}px ${FONT}`;
  const textW = m.measureText(s).width;
  const pad = pillH * 0.4;
  const pillW = textW + pad * 2;
  const gap = pillH * 0.5;
  const W = pillW + gap;

  const c = ctx2d(W, H);
  fill(c, bg);

  const top = (H - pillH) / 2;
  const bot = top + pillH;
  const waist = H * 0.1;
  const wTop = H / 2 - waist;
  const wBot = H / 2 + waist;
  const r = gap / 2;
  const L = r;
  const R = r + pillW;

  c.beginPath();
  c.moveTo(0, wTop);
  c.bezierCurveTo(r * 0.6, wTop, r * 0.4, top, L, top);
  c.lineTo(R, top);
  c.bezierCurveTo(R + r * 0.6, top, R + r * 0.4, wTop, W, wTop);
  c.lineTo(W, wBot);
  c.bezierCurveTo(R + r * 0.4, wBot, R + r * 0.6, bot, R, bot);
  c.lineTo(L, bot);
  c.bezierCurveTo(r * 0.4, bot, r * 0.6, wBot, 0, wBot);
  c.closePath();
  c.fillStyle = pillColor;
  c.fill();

  c.fillStyle = textColor;
  c.font = `500 ${size}px ${FONT}`;
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillText(s, L + pillW / 2, H / 2 + size * 0.06);
  return tex(c.canvas);
}

export function solidStrip(w, h, color = '#ffffff') {
  return tex(fill(ctx2d(w * SS, h * SS), color).canvas);
}

/* The photo band. `zoom` scales the image past the band height so it crops
   top-and-bottom rather than letterboxing; the strip widens to keep aspect. */
export function photoStrip(h, img, zoom = 1) {
  const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const w = ((h * iw) / ih) * zoom;

  const c = ctx2d(w * SS, h * SS);
  fill(c, PALETTE[1]);
  const dh = h * SS * zoom;
  c.drawImage(img, 0, (h * SS - dh) / 2, w * SS, dh);
  return tex(c.canvas);
}

/* Loose poisson dots — the inside face of the photo ring. */
export function dotField(w, h, rng) {
  const W = Math.round(w * SS);
  const H = Math.round(h * SS);
  const c = ctx2d(W, H);
  fill(c, INK);
  c.fillStyle = ACCENT;

  const r = 4 * SS;
  const pts = [];
  let tries = 0;
  while (pts.length < 1000 && tries < 8000) {
    const x = rng() * W;
    const y = rng() * H;
    if (!pts.some((p) => dist(x, y, p.x, p.y) < r * 2)) pts.push({ x, y });
    tries++;
  }
  for (const p of pts) {
    c.beginPath();
    c.arc(p.x, p.y, r / 2, 0, TAU);
    c.fill();
  }
  return tex(c.canvas);
}

/* ---------- procedural pattern bands ---------- */

function checksLight(w, h) {
  const rows = Math.round(h / 25);
  const rowH = (h / rows) * SS;
  const cols = Math.max(2, Math.round((w * SS) / rowH / 2) * 2);
  const colW = (w * SS) / cols;
  const c = ctx2d(w * SS, h * SS);
  fill(c, '#fff');
  c.fillStyle = PALETTE[1];
  for (let r = 0; r < rows; r++)
    for (let i = r % 2; i < cols; i += 2) c.fillRect(i * colW, r * rowH, colW, rowH);
  return tex(c.canvas);
}

function checksAccent(w, h) {
  const rows = Math.round(h / 25);
  const rowH = (h / rows) * SS;
  const cols = Math.max(2, Math.round((w * SS) / (rowH * 8) / 2) * 2);
  const colW = (w * SS) / cols;
  const c = ctx2d(w * SS, h * SS);
  fill(c, PALETTE[0]);
  c.fillStyle = PALETTE[3];
  for (let r = 0; r < rows; r++)
    for (let i = r % 2; i < cols; i += 2) c.fillRect(i * colW, r * rowH, colW, rowH);
  return tex(c.canvas);
}

function scallops(w, h) {
  const n = Math.max(1, Math.round(w / h) * 2);
  const step = (w * SS) / n;
  const H = h * SS;
  const c = ctx2d(w * SS, H);
  fill(c, PALETTE[1]);
  c.fillStyle = PALETTE[0];
  for (let i = 0; i < n; i++) {
    c.beginPath();
    c.arc(i * step + H / 2, H / 2, H / 2, Math.PI / 2, (Math.PI * 3) / 2);
    c.fill();
  }
  return tex(c.canvas);
}

function randomGrid(w, h, rng) {
  const bag = [...PALETTE, ...NEONS];
  const rows = Math.round(h / 10);
  const rowH = (h / rows) * SS;
  const cols = Math.round((w * SS) / rowH);
  const colW = (w * SS) / cols;
  const c = ctx2d(w * SS, h * SS);
  fill(c, PALETTE[0]);
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < cols; i++) {
      c.fillStyle = bag[pick(rng, bag.length)];
      c.fillRect(i * colW, r * rowH, colW, rowH);
    }
  return tex(c.canvas);
}

function gridLines(w, h) {
  const rows = Math.round(h / 25);
  const rowH = (h / rows) * SS;
  const cols = Math.round((w * SS) / rowH);
  const colW = (w * SS) / cols;
  const c = ctx2d(w * SS, h * SS);
  fill(c, PALETTE[1]);
  c.strokeStyle = '#fff';
  c.lineWidth = SS;
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < cols; i++) c.strokeRect(i * colW, r * rowH, colW, rowH);
  return tex(c.canvas);
}

/* A ping-pong ramp across the width, so the seam matches when it tiles. */
function rampH(w, h) {
  const W = Math.round(w * SS);
  const H = Math.round(h * SS);
  const c = ctx2d(W, H);
  for (let x = 0; x < W; x++) {
    const t2 = (x / W) * 2;
    const t = t2 < 1 ? t2 : 2 - t2;
    const i = t < 0.5 ? 0 : 1;
    const local = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const [r, g, b] = mix(rgb(PALETTE[i]), rgb(PALETTE[i + 1]), clamp(local, 0, 1));
    c.fillStyle = `rgb(${r},${g},${b})`;
    c.fillRect(x, 0, 1, H);
  }
  return tex(c.canvas);
}

function rampV(w, h) {
  const W = Math.round(w * SS);
  const H = Math.round(h * SS);
  const c = ctx2d(W, H);
  for (let y = 0; y < H; y++) {
    const a = clamp(Math.floor(y / (H / 2)), 0, 2);
    const b = clamp(a + 1, 0, 2);
    const t = lerp(y, (H * a) / 2, (H * b) / 2, 0, 1);
    const [r, g, bl] = mix(rgb(PALETTE[a]), rgb(PALETTE[b]), clamp(t, 0, 1));
    c.fillStyle = `rgb(${r},${g},${bl})`;
    c.fillRect(0, y, W, 1);
  }
  return tex(c.canvas);
}

/* 4×4 Bayer dither fading left-to-right and back. */
function bayerFade(w, h) {
  const W = Math.round(w * SS);
  const H = Math.round(h * SS);
  const c = ctx2d(W, H);
  fill(c, PALETTE[1]);
  const cell = 10 * SS;
  const M = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  c.fillStyle = PALETTE[3];
  for (let x = 0; x < W; x += cell)
    for (let y = 0; y < H; y += cell) {
      const t2 = (x / W) * 2;
      const t = t2 < 1 ? t2 : 2 - t2;
      if (t > M[Math.floor(y / cell) % 4][Math.floor(x / cell) % 4] / 16)
        c.fillRect(x, y, cell, cell);
    }
  return tex(c.canvas);
}

/* Hands back a `(w, h) => texture` that draws from a shuffled bag, so a badge
   never repeats a pattern until all eight have been used. */
export function patternDealer(rng) {
  const makers = [
    (w, h) => checksLight(w, h),
    (w, h) => checksAccent(w, h),
    (w, h) => scallops(w, h),
    (w, h) => randomGrid(w, h, rng),
    (w, h) => rampH(w, h),
    (w, h) => rampV(w, h),
    (w, h) => bayerFade(w, h),
    (w, h) => gridLines(w, h),
  ];
  let bag = [];
  return (w, h) => {
    if (bag.length === 0) {
      bag = makers.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = pick(rng, i + 1);
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return makers[bag.pop()](w, h);
  };
}

export function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = pick(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
