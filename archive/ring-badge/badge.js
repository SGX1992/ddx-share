import { RingGL, makeMvp, SEG } from './ringgl.js';
import {
  ACCENT, CARD_BG, FONT, INK, PALETTE, TAU,
  capsuleStrip, dotField, patternDealer, photoStrip, rngFrom, shuffled, solidStrip, textStrip,
} from './textures.js';

export const W = 1080;
export const H = 1350;
export const LOOP = 8; // seconds — every export is exactly one cycle

/* Orthographic frame. Ring coordinates are y-down (spec.y grows toward the
   bottom of the badge), so the world y handed to the matrix is negated. */
const CAM = (() => {
  const camW = 1048;
  const camH = (1048 * H) / W;
  const camY = -20;
  const camZ = 500;
  const near = -3000;
  const far = 15000;
  return {
    camW, camH, camY, camZ,
    sx: 1 / (camW / 2),
    sy: 1 / (camH / 2),
    sz: -2 / (far - near),
    zc: -(far + near) / (far - near),
    pxScale: W / camW,
    frustumTop: camH / 2 + camY,
  };
})();

const TOP_BOUND = -458;
const BOT_BOUND = 450;

const GROUPS = [
  { bg: '#141414', fg: () => '#FFFFFF' },
  { bg: ACCENT, fg: () => INK },
  { bg: '#FFFFFF', fg: (r) => (r() > 0.5 ? INK : PALETTE[4]) },
];

/* Six bands, top to bottom. `y` is y-down from the badge centre; `outer` is the
   face you read, `inner` is what shows through the ring from behind. */
function ringSpecs(data, rng) {
  const [gA, gB, gC] = shuffled(GROUPS, rng);
  const gName = GROUPS[Math.floor(rng() * GROUPS.length)];
  const pattern = patternDealer(rng);

  const pillBg = gC.bg;
  const pillColor = shuffled(
    ['#141414', ACCENT, '#FFFFFF'].filter((c) => c !== pillBg),
    rng,
  )[0];
  const pillText = pillColor === '#141414' ? '#FFFFFF' : INK;

  const face = () =>
    data.photo ? photoStrip(300, data.photo, data.photoZoom) : solidStrip(260, 300, PALETTE[1]);

  return [
    {
      h: 80, y: -295, radius: 450, rotX: 0.227, rotZ: 0.06,
      outer: () => textStrip(80, data.name, gName.bg, gName.fg(rng), { fit: Math.PI * 450 }),
      inner: () => pattern(700, 80),
      scroll: 2, innerScroll: -1,
      bobAmp: 3, bobPhase: 0, swayAmp: 0.008, breatheAmp: 3,
    },
    {
      h: 300, y: -105, radius: 308, rotX: 0.081, rotZ: -0.03,
      outer: face,
      inner: () => dotField(1100, 300, rng),
      scroll: 1, innerScroll: 1,
      bobAmp: 2, bobPhase: 0.5, swayAmp: 0.005, breatheAmp: 2,
    },
    {
      h: 80, y: 85, radius: 210, rotX: -0.066, rotZ: 0.03,
      outer: () => (data.company
          ? textStrip(80, data.company, gA.bg, gA.fg(rng), { fit: Math.PI * 210 })
          : pattern(450, 80)),
      inner: () => pattern(450, 80),
      scroll: -1, innerScroll: 1,
      bobAmp: 3, bobPhase: 0.25, swayAmp: 0.008, breatheAmp: 2,
    },
    {
      h: 80, y: 175, radius: 340, rotX: -0.09, rotZ: 0.05,
      outer: () => (data.role
          ? textStrip(80, data.role, gB.bg, gB.fg(rng), { fit: Math.PI * 340 })
          : pattern(700, 80)),
      inner: () => pattern(700, 80),
      scroll: 2, innerScroll: -1,
      bobAmp: 2, bobPhase: 0.62, swayAmp: 0.008, breatheAmp: 2,
    },
    {
      h: 70, y: 272, radius: 220, rotX: -0.11, rotZ: 0.04,
      outer: () => capsuleStrip(70, data.edition.pill, pillBg, pillColor, pillText),
      inner: () => pattern(450, 70),
      scroll: 2, innerScroll: -1,
      bobAmp: 2, bobPhase: 0.4, swayAmp: 0.008, breatheAmp: 2,
    },
    {
      h: 80, y: 295, radius: 460, rotX: -0.229, rotZ: -0.05,
      outer: () => pattern(1000, 80),
      inner: () => pattern(800, 80),
      scroll: 1, innerScroll: -1,
      bobAmp: 3, bobPhase: 0.8, swayAmp: 0.008, breatheAmp: 3,
    },
  ];
}

const CHORD_K = 2 * Math.sin(Math.PI / SEG); // chord length per unit radius

export class Badge {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');

    this.gl = new RingGL(W, H);
    this.rings = [];
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.hovered = null;
    this.offsets = new Map(); // ring index -> { dy, rz, tilt }, survives a reshuffle
    this.mvp = new Float32Array(16);
    this.edition = null;

    this.wordmark = new Image();
    this.wordmark.src = 'assets/img/ddx-wordmark.png';
    this.wordmarkReady = new Promise((res) => {
      this.wordmark.onload = res;
      this.wordmark.onerror = res;
    });
  }

  reseed() {
    this.seed = (Math.random() * 0xffffffff) >>> 0;
  }

  setData(data) {
    for (const r of this.rings) {
      this.gl.deleteTexture(r.outerTex);
      this.gl.deleteTexture(r.innerTex);
    }
    this.edition = data.edition;
    const rng = rngFrom(this.seed);
    this.rings = ringSpecs(data, rng).map((spec, i) => {
      const outer = spec.outer();
      const inner = spec.inner();
      const off = this.offsets.get(i) || { dy: 0, rz: 0, tilt: 0 };
      return {
        spec,
        outerTex: this.gl.texture(outer.canvas),
        innerTex: this.gl.texture(inner.canvas),
        outerW: outer.worldWidth,
        innerW: inner.worldWidth,
        ...off,
      };
    });
  }

  /* ---------- pointer interaction ---------- */

  toWorld(px, py) {
    return { wx: (px - W / 2) / CAM.pxScale, wy: py / CAM.pxScale - CAM.frustumTop };
  }

  /* Which band is under the cursor: the one whose visible front edge is closest,
     preferring the ring whose surface is nearest the camera at that x. */
  pick(px, py) {
    const { wx, wy } = this.toWorld(px, py);
    let best = null;
    let bestDepth = -Infinity;
    this.rings.forEach((ring, i) => {
      const s = ring.spec;
      if (Math.abs(wx) > s.radius + 15) return;
      const t = Math.max(-1, Math.min(1, wx / s.radius));
      const front = Math.sqrt(1 - t * t);
      const yAt = s.y + ring.dy + s.radius * front * Math.sin(-(s.rotX + ring.tilt));
      if (Math.abs(wy - yAt) > s.h / 2 + 14) return;
      const depth = s.radius * front;
      if (depth > bestDepth) {
        bestDepth = depth;
        best = i;
      }
    });
    return best;
  }

  /* Middle of a ring drags it up and down, the shoulders tilt it, the far ends
     roll it — which is why the cursor changes as you move across a band. */
  grabInfo(i, px) {
    const dx = px - W / 2;
    const rPx = this.rings[i].spec.radius * CAM.pxScale;
    const t = Math.abs(dx) / rPx;
    return { mode: t > 0.62 ? 'rotate' : t > 0.32 ? 'tilt' : 'move', side: dx < 0 ? -1 : 1 };
  }

  extent(spec, rotZ, rotX) {
    const minor = spec.radius * Math.abs(Math.sin(rotX));
    return (
      Math.hypot(spec.radius * Math.sin(rotZ), minor * Math.cos(rotZ)) +
      spec.h / 2 + spec.bobAmp + spec.breatheAmp + 6
    );
  }

  nudge(i, dy, drz, dtilt = 0) {
    const ring = this.rings[i];
    const s = ring.spec;
    const prev = this.offsets.get(i) || { dy: 0, rz: 0, tilt: 0 };

    let rz = Math.max(-0.3, Math.min(0.3, prev.rz + drz));
    let tilt = Math.max(-0.35, Math.min(0.35, prev.tilt + dtilt));
    let ext = this.extent(s, s.rotZ + rz, s.rotX + tilt);

    // A new angle that would push the ring out of frame is refused outright.
    if (s.y + prev.dy - ext < TOP_BOUND || s.y + prev.dy + ext > BOT_BOUND) {
      const wasExt = this.extent(s, s.rotZ + prev.rz, s.rotX + prev.tilt);
      if (ext > wasExt) {
        rz = prev.rz;
        tilt = prev.tilt;
        ext = wasExt;
      }
    }
    const lo = TOP_BOUND + ext - s.y;
    const hi = BOT_BOUND - ext - s.y;
    const ndy = Math.max(lo, Math.min(hi, prev.dy + dy / CAM.pxScale));

    this.offsets.set(i, { dy: ndy, rz, tilt });
    Object.assign(ring, { dy: ndy, rz, tilt });
  }

  /* ---------- drawing ---------- */

  renderAt(seconds) {
    const t = (((seconds / LOOP) % 1) + 1) % 1;
    this.gl.begin([1, 0.95, 0.02]);

    this.rings.forEach((ring, i) => {
      const s = ring.spec;
      const hover = this.hovered === i ? 1 : 0;
      const radius = s.radius + s.breatheAmp * Math.sin(TAU * (t + 0.13));
      const bob = s.bobAmp * Math.sin(TAU * (t + s.bobPhase));
      const sway = s.swayAmp * Math.sin(TAU * (t + s.bobPhase + 0.31));

      const rotX = -(s.rotX + ring.tilt);
      const rotZ = -(s.rotZ + sway + ring.rz);
      const ty = -(s.y + bob + ring.dy);
      makeMvp(this.mvp, rotX, rotZ, 0, ty, 0, CAM);

      this.gl.drawBand({
        mvp: this.mvp, radius, halfH: s.h / 2, angOff: 0,
        uvA: -(radius * CHORD_K) / ring.outerW,
        uvB: 1 + t * s.scroll,
        texture: ring.outerTex, hover,
      });
      const rIn = radius - 1;
      this.gl.drawBand({
        mvp: this.mvp, radius: rIn, halfH: s.h / 2, angOff: Math.PI,
        uvA: (TAU * rIn) / SEG / ring.innerW,
        uvB: t * s.innerScroll,
        texture: ring.innerTex, hover,
      });
    });

    const c = this.ctx;
    c.fillStyle = CARD_BG;
    c.fillRect(0, 0, W, H);
    c.drawImage(this.gl.canvas, 0, 0, W, H);
    this.drawOverlay(c);
    return this.canvas;
  }

  drawOverlay(c) {
    const ed = this.edition;
    if (this.wordmark.naturalWidth) {
      const w = 160;
      c.drawImage(this.wordmark, 58, 52, w, (w * this.wordmark.naturalHeight) / this.wordmark.naturalWidth);
    }
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.fillStyle = '#ffffff';
    c.font = `600 42px ${FONT}`;
    c.fillText((ed ? ed.city : '').toUpperCase(), 58, 144);
    c.fillStyle = ACCENT;
    c.font = `400 26px ${FONT}`;
    tracked(c, ed ? ed.date : '', 58, 180, 3);

    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.fillRect(58, 1244, W - 116, 1.5);
    c.fillStyle = '#ffffff';
    c.font = `600 26px ${FONT}`;
    tracked(c, 'DDXCONFERENCE.COM', 58, 1296, 3.4);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.font = `400 26px ${FONT}`;
    trackedRight(c, 'INNOVATION MEETS PEOPLE', W - 58, 1296, 3.4);
  }
}

/* Canvas has no letter-spacing in Safari, so draw the tracking by hand. */
function trackedWidth(c, s, sp) {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += c.measureText(s[i]).width + (i < s.length - 1 ? sp : 0);
  return w;
}
function tracked(c, s, x, y, sp) {
  let cx = x;
  for (const ch of s) {
    c.fillText(ch, cx, y);
    cx += c.measureText(ch).width + sp;
  }
}
function trackedRight(c, s, right, y, sp) {
  tracked(c, s, right - trackedWidth(c, s, sp), y, sp);
}
