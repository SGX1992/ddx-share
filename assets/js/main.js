import { Poster } from './poster.js';
import { EDITIONS, DEFAULT_EDITION, byId, prettyDate } from './editions.js';
import { download, hasMp4, toGif, toMp4, toPng, toWebm } from './exporters.js';
import { backgroundVideo } from './videobg.js';
import { variants, thumbUrl } from './backgrounds.js';
import { combo } from './combo.js';

const $ = (id) => document.getElementById(id);

const nameInput = $('nameInput');
const editionInput = $('editionInput');
const uploadBtn = $('uploadBtn');
const webcamBtn = $('webcamBtn');
const fileInput = $('fileInput');
const zoomInput = $('zoomInput');
const panInput = $('panInput');
const photoThumb = $('photoThumb');
const previewCanvas = $('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');
const modeInputs = [...document.querySelectorAll('input[name="mode"]')];
const bgField = $('bgField');
const bgThumbs = $('bgThumbs');
const actionGroups = [...document.querySelectorAll('.actions[data-for]')];
const statusEl = $('exportStatus');
const mp4Btn = $('mp4Btn');
const pngBtn = $('pngBtn');
const gifBtn = $('gifBtn');

for (const e of EDITIONS) {
  const o = document.createElement('option');
  o.value = e.id;
  o.textContent = `DDX ${e.city} — ${prettyDate(e)}`;
  editionInput.append(o);
}
editionInput.value = DEFAULT_EDITION;

/* Runs before the combobox is built, so the control paints the edition the link
   asked for rather than the default and then silently disagreeing with it. */
{
  const q = new URLSearchParams(location.search);
  const n = q.get('name');
  if (n !== null) nameInput.value = n.slice(0, 40);
  const ed = (q.get('edition') || q.get('city') || '').toLowerCase().replace(/\s+/g, '-');
  if (EDITIONS.some((e) => e.id === ed)) editionInput.value = ed;
}

/* The select stays as the model; this draws the control over it. Everything
   below still reads editionInput.value and listens for its change event. */
combo({
  select: editionInput,
  labelledBy: 'editionLabel',
  items: EDITIONS.map((e) => ({ value: e.id, title: `DDX ${e.city}`, meta: prettyDate(e) })),
});

const poster = new Poster();
let photo = null;
let exporting = false;

/* The stand-in in the card before anyone uploads: a portrait blurred past
   recognition, so the slot reads as "a person goes here" without showing one.
   The drawn version below is the fallback for the fallback — if the file is
   ever missing, the card still says what it wants rather than going blank. */
const PLACEHOLDER_SRC = 'assets/img/placeholder-photo.jpg';

function loadPlaceholder() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(drawnPlaceholder());
    img.src = PLACEHOLDER_SRC;
  });
}

function drawnPlaceholder() {
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 1100;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1100);
  g.addColorStop(0, '#2A2E34');
  g.addColorStop(1, '#111317');
  x.fillStyle = g;
  x.fillRect(0, 0, 900, 1100);

  x.strokeStyle = 'rgba(255,255,255,.34)';
  x.lineCap = 'round';
  x.lineWidth = 14;
  x.beginPath();
  x.arc(450, 400, 120, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.moveTo(238, 800);
  x.bezierCurveTo(238, 596, 662, 596, 662, 800);
  x.stroke();

  x.fillStyle = 'rgba(255,255,255,.45)';
  x.font = '500 34px "Helvetica Neue", Inter, Helvetica, Arial, sans-serif';
  x.textAlign = 'center';
  x.fillText('ADD YOUR PHOTO', 450, 950);
  return c;
}

const currentMode = () => modeInputs.find((i) => i.checked)?.value || 'image';

let bgIndex = 0;

function readForm() {
  return {
    name: nameInput.value.trim(),
    edition: byId(editionInput.value),
    mode: currentMode(),
    bgIndex,
    photo,
    photoZoom: parseFloat(zoomInput.value) || 1,
  };
}

/* One tile per shot the edition offers. Hidden when there is nothing to choose
   between — a single background, or Video, where the clip is shared by all.

   The tiles are rebuilt only when the edition or the format changes. Rebuilding
   them on every render would swap the DOM out from under the click that caused
   it, and the handler would then be marking a node that is no longer on the
   page — which is exactly how the selection highlight used to vanish on the
   second pick. Everything else just re-reads `bgIndex`. */
let thumbsToken = 0;
let thumbsKey = null;

function markChecked() {
  [...bgThumbs.children].forEach((t, i) => t.setAttribute('aria-checked', String(i === bgIndex)));
}

async function renderThumbs(edition, mode) {
  if (mode !== 'image') {
    bgField.hidden = true;
    thumbsKey = null;
    return;
  }
  const key = `${edition.id}|${mode}`;
  if (key === thumbsKey) {
    markChecked();
    return;
  }
  thumbsKey = key;

  const token = ++thumbsToken;
  const list = await variants(edition);
  if (token !== thumbsToken) return;

  bgField.hidden = list.length < 2;
  bgThumbs.replaceChildren();
  if (list.length < 2) return;

  list.forEach((v, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb';
    b.role = 'radio';
    b.title = v.label;
    const img = document.createElement('img');
    img.src = thumbUrl(v.file);
    img.alt = v.label;
    img.loading = 'lazy';
    const cap = document.createElement('span');
    cap.textContent = v.label;
    b.append(img, cap);
    b.addEventListener('click', () => {
      if (bgIndex === i) return;
      bgIndex = i;
      markChecked();
      rebuild();
    });
    bgThumbs.append(b);
  });
  markChecked();
}

let pending = 0;
async function rebuild() {
  const token = ++pending;
  const mode = currentMode();
  for (const g of actionGroups) g.hidden = g.dataset.for !== mode;
  renderThumbs(byId(editionInput.value), mode);
  await poster.setData(readForm());
  if (token !== pending) return; // a newer edition or format won the race
}

/* Text is measured with the real font, so nothing may render before the webfont
   lands — otherwise every fitted size is computed for Arial and then re-flows. */
/* Only the webfont needs awaiting — Helvetica Neue, where it exists, is already
   installed. On a Mac these resolve instantly and Inter simply goes unused. */
const fontsReady = Promise.all([
  document.fonts.load('700 150px "Inter"'),
  document.fonts.load('600 44px "Inter"'),
  document.fonts.load('500 34px "Inter"'),
]).catch(() => {});

Promise.all([fontsReady, poster.wordmarkReady]).then(async () => {
  photo = await loadPlaceholder();
  await rebuild();
  revealPage();
  poster.beginIntro(); // the poster assembles itself layer by layer
  warmVideo();
});

/* The entrance waits for the webfont and the first drawn frame, so the panel
   never deals itself in around an empty preview. Index each control so the CSS
   can stagger them, then hand over — the animation is entirely in the
   stylesheet, which is what keeps it out of the render loop. */
function revealPage() {
  const items = [...document.querySelectorAll('.panel > *'), document.querySelector('.actions-area')];
  items.forEach((el, i) => el?.style.setProperty('--i', i));
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('ready')));
}

/* The sliding pill in the format switch reads its position off the wrapper. */
const segmented = document.querySelector('.segmented');
const syncSegment = () => segmented?.setAttribute('data-mode', currentMode());

/* Fetch the clip in the background once the poster is up, so switching to Video
   is instant instead of a black frame while several megabytes arrive. It waits
   for the first render so it never competes with the initial paint, and the
   result is cached — setData just picks it up. */
function warmVideo() {
  const go = () => backgroundVideo().catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 3000 });
  else setTimeout(go, 1200);
}

let nameSettle = 0;
nameInput.addEventListener('input', () => {
  rebuild();
  /* Wait for the typing to stop, then let the name write itself in. */
  clearTimeout(nameSettle);
  nameSettle = setTimeout(() => poster.pulseName(), 380);
});
editionInput.addEventListener('change', async () => {
  bgIndex = 0; // each city's shots are its own; don't carry an index across
  await rebuild();
  poster.beginIntro({ keepBackground: true }); // the poster rebuilds for the new city
});
for (const i of modeInputs) i.addEventListener('change', () => { syncSegment(); rebuild(); });
syncSegment();
zoomInput.addEventListener('input', rebuild);
panInput.addEventListener('input', () => poster.setFraming(parseFloat(panInput.value)));

function setPhoto(source) {
  photo = source;
  uploadBtn.classList.remove('attention');
  uploadBtn.classList.add('has-photo');
  uploadBtn.querySelector('span').textContent = 'Change Photo';

  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const iw = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const ih = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const side = Math.min(iw, ih);
  x.drawImage(source, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, 128, 128);
  photoThumb.src = c.toDataURL();
  photoThumb.hidden = false;
  panInput.value = -0.25;
  rebuild();
}

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(img.src);
    setPhoto(img);
  };
  img.src = URL.createObjectURL(file);
});

/* ---------- webcam ---------- */
{
  const dialog = $('webcamDialog');
  const video = $('camVideo');
  let stream = null;
  const stop = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  };
  webcamBtn.addEventListener('click', async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
    } catch {
      setStatus('Could not access the camera — check your browser permissions.');
      return;
    }
    video.srcObject = stream;
    dialog.showModal();
  });
  $('camShoot').addEventListener('click', () => {
    if (!video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    let cw = vh * (3 / 4);
    let ch = vh;
    if (cw > vw) {
      cw = vw;
      ch = vw * (4 / 3);
    }
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 1200;
    const x = c.getContext('2d');
    x.translate(c.width, 0);
    x.scale(-1, 1); // un-mirror the selfie view
    x.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, c.width, c.height);
    stop();
    dialog.close();
    setPhoto(c);
  });
  $('camCancel').addEventListener('click', () => {
    stop();
    dialog.close();
  });
  dialog.addEventListener('cancel', stop);
}

/* ---------- dragging the photo inside the card ---------- */
{
  const at = (e) => {
    const r = previewCanvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * previewCanvas.width,
      y: ((e.clientY - r.top) / r.height) * previewCanvas.height,
      scale: previewCanvas.width / r.width,
    };
  };
  const overCard = (p) => {
    const c = poster.card;
    return p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h;
  };

  let drag = null;
  previewCanvas.addEventListener('pointerdown', (e) => {
    const p = at(e);
    if (!overCard(p) || !poster.photoRect()) return;
    drag = { x: p.x, y: p.y };
    previewCanvas.setPointerCapture(e.pointerId);
    previewCanvas.style.cursor = 'grabbing';
    e.preventDefault();
  });
  previewCanvas.addEventListener('pointermove', (e) => {
    const p = at(e);
    if (drag) {
      poster.nudgePhoto(p.x - drag.x, p.y - drag.y);
      drag = { x: p.x, y: p.y };
      panInput.value = poster.pan.y; // keep the slider honest after a drag
    } else {
      previewCanvas.style.cursor = overCard(p) && poster.photoRect() ? 'grab' : 'default';
    }
  });
  const release = () => {
    drag = null;
    previewCanvas.style.cursor = 'default';
  };
  previewCanvas.addEventListener('pointerup', release);
  previewCanvas.addEventListener('pointercancel', release);
  previewCanvas.addEventListener('pointerleave', () => {
    if (!drag) release();
  });
}

/* ---------- the live preview ---------- */
function tick() {
  requestAnimationFrame(tick);
  if (exporting || !poster.data) return;
  previewCtx.drawImage(poster.renderAt(), 0, 0);
}
requestAnimationFrame(tick);

/* ---------- exports ---------- */
function slug() {
  const s = (nameInput.value.trim() || 'ddx').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return s.replace(/^-|-$/g, '') || 'ddx';
}
const filename = (ext) => `ddx-${editionInput.value}-i-am-going-${slug()}.${ext}`;

function setStatus(msg) {
  statusEl.hidden = !msg;
  statusEl.textContent = msg ?? '';
}

async function run(button, job) {
  if (exporting) return;
  exporting = true;
  mp4Btn.disabled = pngBtn.disabled = gifBtn.disabled = true;
  const label = button.innerHTML;
  try {
    setStatus(null);
    await fontsReady;
    poster.skipIntro(); // an export is always the finished poster
    await rebuild();
    await job((p) => (button.textContent = `Rendering… ${Math.round(p * 100)}%`));
  } catch (err) {
    console.error(err);
    setStatus(`Export failed: ${err.message}`);
  } finally {
    button.innerHTML = label;
    mp4Btn.disabled = pngBtn.disabled = gifBtn.disabled = false;
    exporting = false;
  }
}

pngBtn.addEventListener('click', () =>
  run(pngBtn, async () => download(await toPng(poster), filename('png'))),
);
gifBtn.addEventListener('click', () =>
  run(gifBtn, async (p) => download(await toGif(poster, p), filename('gif'))),
);
mp4Btn.addEventListener('click', () =>
  run(mp4Btn, async (p) => {
    if (hasMp4()) return download(await toMp4(poster, p), filename('mp4'));
    setStatus('This browser has no MP4 encoder — exporting WebM instead.');
    download(await toWebm(poster, p), filename('webm'));
  }),
);
