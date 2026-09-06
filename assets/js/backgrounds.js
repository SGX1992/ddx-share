/* Backgrounds live in assets/img/bg/. An edition can offer several shots; which
   ones, and in what order, comes from manifest.json. The first entry is the
   default, and the rest show up in the picker.

   An edition absent from the manifest still works — it falls back to probing
   <id>.avif/.jpg/.png/.webp so a file can simply be dropped in — then to
   `default`, and finally to a drawn stand-in so the poster is never broken. */

const DIR = 'assets/img/bg';
const EXTS = ['avif', 'jpg', 'png', 'webp'];

let manifestPromise = null;
const imageCache = new Map();
const variantCache = new Map();

function manifest() {
  manifestPromise ||= fetch(`${DIR}/manifest.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return manifestPromise;
}

function loadOne(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function probe(base) {
  for (const ext of EXTS) {
    const img = await loadOne(`${DIR}/${base}.${ext}`);
    if (img) return { file: `${base}.${ext}`, label: 'Background', image: img };
  }
  return null;
}

const clean = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((v) => v && typeof v.file === 'string')
    .map((v) => ({ file: v.file, label: v.label || 'Background' }));

/* The list the picker renders: the edition's own shots first, then the neutral
   set from `_shared`, which every edition offers. Never empty-handed — an edition
   with nothing of its own reports whatever `default` offers, or a drawn stand-in. */
export async function variants(edition) {
  const key = edition?.id || '_none';
  if (variantCache.has(key)) return variantCache.get(key);
  const p = (async () => {
    const m = await manifest();
    const shared = clean(m._shared);
    /* With no edition chosen there is nothing to illustrate, so the poster wears
       the first neutral and offers no choice at all. */
    if (!edition) return shared.slice(0, 1);
    const own = clean(m[edition.id]);
    if (own.length) return [...own, ...shared];

    const found = await probe(edition.id);
    if (found) return [{ file: found.file, label: found.label }, ...shared];

    const fallback = clean(m.default);
    if (fallback.length) return [...fallback, ...shared];

    const dflt = await probe('default');
    if (dflt) return [{ file: dflt.file, label: dflt.label }, ...shared];
    return shared;
  })();
  variantCache.set(key, p);
  return p;
}

export const thumbUrl = (file) => `${DIR}/${file}`;

/* Resolves to { image, file, placeholder }. `image` is always drawable. */
export async function background(edition, index = 0) {
  const list = await variants(edition);
  const pick = list[Math.min(Math.max(index, 0), list.length - 1)];
  if (!pick) return { image: standIn(edition), file: null, placeholder: true };

  if (!imageCache.has(pick.file)) imageCache.set(pick.file, loadOne(`${DIR}/${pick.file}`));
  const image = await imageCache.get(pick.file);
  return image
    ? { image, file: pick.file, placeholder: false }
    : { image: standIn(edition), file: null, placeholder: true };
}

/* Drop a new file in and this clears so it shows up on the next render. */
export function forget() {
  manifestPromise = null;
  variantCache.clear();
  imageCache.clear();
}

/* A drawn stand-in: the edition's tint sunk into black, with the DDX chevron
   repeated as a faint watermark so an unfinished poster still looks deliberate. */
function standIn(edition) {
  edition = edition || {};
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');

  const g = x.createLinearGradient(0, 0, W * 0.35, H);
  g.addColorStop(0, edition.tint || '#243040');
  g.addColorStop(0.55, '#0C0F14');
  g.addColorStop(1, '#000000');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  const glow = x.createRadialGradient(W * 0.72, H * 0.12, 0, W * 0.72, H * 0.12, W * 0.8);
  glow.addColorStop(0, 'rgba(255,255,255,.14)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = glow;
  x.fillRect(0, 0, W, H);

  x.save();
  x.globalAlpha = 0.06;
  x.strokeStyle = '#FFFFFF';
  x.lineWidth = 14;
  for (let row = -1; row < 5; row++) {
    for (let col = -1; col < 5; col++) {
      const ox = col * 260 + (row % 2 ? 130 : 0);
      const oy = row * 300;
      x.beginPath();
      x.moveTo(ox, oy);
      x.lineTo(ox + 90, oy + 90);
      x.lineTo(ox, oy + 180);
      x.stroke();
    }
  }
  x.restore();
  return c;
}
