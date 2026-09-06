import { Poster } from './poster.js';
import { EDITIONS, DEFAULT_EDITION, NO_EDITION, byId, prettyDate } from './editions.js';
import { canShareFiles, download, hasMp4, shareFile, toGif, toMp4, toPng, toWebm } from './exporters.js';
import { backgroundVideo, clips, posterUrl } from './videobg.js';
import { variants, thumbUrl } from './backgrounds.js';
import { combo } from './combo.js';
import { variant } from './variant.js';

const $ = (id) => document.getElementById(id);

const nameInput = $('nameInput');
const roleInput = $('roleInput');
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
const headlineInputs = [...document.querySelectorAll('input[name="headline"]')];

/* The speaker build differs only in its wording and the label above the
   headline — everything else, including every asset, is shared. */
{
  const v = variant();
  document.title = v.title;
  headlineInputs.forEach((input, i) => {
    if (i >= v.headlines.length) return;   // the last one is the "none" option
    input.value = v.headlines[i];
    const span = input.nextElementSibling;
    if (span) span.textContent = v.chips[i];
  });
}
const bgField = $('bgField');
const bgThumbs = $('bgThumbs');
const bgFieldLabel = bgField.querySelector('span');
const actionGroups = [...document.querySelectorAll('.actions[data-for]')];
const statusEl = $('exportStatus');
const mp4Btn = $('mp4Btn');
const pngBtn = $('pngBtn');
const gifBtn = $('gifBtn');

{
  const none = document.createElement('option');
  none.value = NO_EDITION;
  none.textContent = 'Choose your edition';
  editionInput.append(none);
}
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
  const r = q.get('role');
  if (r !== null) roleInput.value = r.slice(0, 60);
  const ed = (q.get('edition') || q.get('city') || '').toLowerCase().replace(/\s+/g, '-');
  if (EDITIONS.some((e) => e.id === ed)) editionInput.value = ed;
}

/* The select stays as the model; this draws the control over it. Everything
   below still reads editionInput.value and listens for its change event. */
const editionCombo = combo({
  select: editionInput,
  labelledBy: 'editionLabel',
  items: [
    { value: NO_EDITION, title: 'Choose your edition', meta: '' },
    ...EDITIONS.map((e) => ({ value: e.id, title: `DDX ${e.city}`, meta: prettyDate(e) })),
  ],
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

/* One index per format: the two pickers are different lists, and carrying a
   position from a seven-shot city into a two-clip list would land nowhere. */
let bgIndex = 0;
let videoIndex = 0;

function readForm() {
  return {
    name: nameInput.value.trim(),
    role: roleInput.value.trim(),
    edition: byId(editionInput.value),
    mode: currentMode(),
    headline: headlineInputs.find((i) => i.checked)?.value,
    bgIndex,
    videoIndex,
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

const currentIndex = () => (currentMode() === 'video' ? videoIndex : bgIndex);

function markChecked() {
  const active = currentIndex();
  [...bgThumbs.children].forEach((t, i) => t.setAttribute('aria-checked', String(i === active)));
}

async function renderThumbs(edition, mode) {
  if (!edition) {
    bgField.hidden = true;
    thumbsKey = null;
    return;
  }
  const key = `${mode}|${edition.id}`;
  if (key === thumbsKey) {
    markChecked();
    return;
  }
  thumbsKey = key;

  const token = ++thumbsToken;
  const list =
    mode === 'video'
      ? (await clips(edition)).map((c) => ({ label: c.label, thumb: posterUrl(c) }))
      : (await variants(edition)).map((v) => ({ label: v.label, thumb: thumbUrl(v.file) }));
  if (token !== thumbsToken) return;

  bgField.hidden = list.length < 2;
  bgThumbs.replaceChildren();
  if (list.length < 2) return;

  list.forEach((item, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb';
    b.role = 'radio';
    b.title = item.label;
    if (item.thumb) {
      const img = document.createElement('img');
      img.src = item.thumb;
      img.alt = item.label;
      img.loading = 'lazy';
      b.append(img);
    }
    const cap = document.createElement('span');
    cap.textContent = item.label;
    b.append(cap);
    b.addEventListener('click', () => {
      if (currentIndex() === i) return;
      if (currentMode() === 'video') videoIndex = i;
      else bgIndex = i;
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
  const edition = byId(editionInput.value);
  /* One class drives the whole locked state; the fields carry .needs-edition. */
  document.body.classList.toggle('needs-edition', !edition);
  /* Hand the running highlight along: the picker until an event is chosen,
     then the upload button until a photo is. `photo` is not the test — it
     holds the blurred stand-in from the first render — so the class setPhoto
     adds is what says a real one has arrived. */
  editionCombo.attention(!edition);
  uploadBtn.classList.toggle(
    'attention', !!edition && !uploadBtn.classList.contains('has-photo'));
  if (edition) editionCombo.drop(NO_EDITION);
  for (const g of actionGroups) g.hidden = g.dataset.for !== mode;
  bgFieldLabel.textContent = mode === 'video' ? 'Clip' : 'Background';
  renderThumbs(edition, mode);
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
  const go = () => backgroundVideo(byId(editionInput.value), videoIndex).catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 3000 });
  else setTimeout(go, 1200);
}

/* No debounce any more: the poster works out which characters actually changed
   and animates only those, so firing on every keystroke is what makes it feel
   like the letters are being typed onto the badge. */
nameInput.addEventListener('input', rebuild);
roleInput.addEventListener('input', rebuild);
editionInput.addEventListener('change', async () => {
  bgIndex = 0; // each city's shots and clips are its own; don't carry an index across
  videoIndex = 0;
  await rebuild();
  poster.beginIntro({ keepBackground: true }); // the poster rebuilds for the new city
});
for (const i of modeInputs) i.addEventListener('change', () => { syncSegment(); rebuild(); });
for (const i of headlineInputs) i.addEventListener('change', rebuild);
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

const uploadBar = $('uploadBar');
const uploadBarFill = $('uploadBarFill');
const uploadBarLabel = $('uploadBarLabel');

function showUpload(p, label) {
  uploadBar.hidden = false;
  uploadBarFill.style.width = `${Math.round(p * 100)}%`;
  uploadBarLabel.textContent = label;
}
const hideUpload = () => {
  uploadBar.hidden = true;
  uploadBarFill.style.width = '0%';
};

/* FileReader rather than an object URL, purely so there is a real number to
   report — a phone photo is easily 10 MB and the wait is long enough to need
   explaining. Decoding afterwards has no progress to give, hence the second
   label rather than a bar that pretends. */
function readImage(file, onProgress) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('That file is not an image.'));
    const fr = new FileReader();
    fr.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    fr.onerror = () => reject(new Error('Could not read that file.'));
    fr.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("The browser couldn't open that image."));
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

async function acceptFile(file) {
  if (!file) return;
  try {
    showUpload(0, 'Reading photo…');
    const img = await readImage(file, (p) => showUpload(p * 0.9, 'Reading photo…'));
    showUpload(1, 'Ready');
    setPhoto(img);
    setTimeout(hideUpload, 700);
  } catch (err) {
    hideUpload();
    setStatus(err.message);
  }
}

uploadBtn.addEventListener('click', () => fileInput.click());

/* The pair floating over the portrait card are a second door to the same two
   actions, so they delegate rather than duplicating any logic. */
$('cardOverlay').addEventListener('click', (e) => {
  const act = e.target.closest('.card-cta')?.dataset.act;
  if (act === 'upload') uploadBtn.click();
  else if (act === 'camera') webcamBtn.click();
});
fileInput.addEventListener('change', () => {
  acceptFile(fileInput.files?.[0]);
  fileInput.value = ''; // so picking the same file twice still fires
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
  /* On a phone the native camera is better than anything getUserMedia gives us:
     full sensor resolution, the familiar shutter, and no permission dialog of
     our own. `capture` opens it directly. Desktops get the in-page preview. */
  const cameraInput = $('cameraInput');
  cameraInput.addEventListener('change', () => {
    acceptFile(cameraInput.files?.[0]);
    cameraInput.value = '';
  });
  const nativeCamera = () => matchMedia('(pointer: coarse)').matches;

  webcamBtn.addEventListener('click', async () => {
    if (nativeCamera()) return cameraInput.click();
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

  const overlay = $('cardOverlay');
  const showOverlay = (on) => overlay.classList.toggle('is-on', on);
  /* The buttons themselves accept the pointer, so once you reach one the canvas
     stops reporting — this keeps the overlay up while you're on it. */
  overlay.addEventListener('pointerover', () => showOverlay(true));

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
      const on = overCard(p) && Boolean(poster.photoRect());
      previewCanvas.style.cursor = on ? 'grab' : 'default';
      showOverlay(on);
    }
  });
  const release = () => {
    drag = null;
    previewCanvas.style.cursor = 'default';
  };
  previewCanvas.parentElement.addEventListener('pointerleave', () => showOverlay(false));

  /* ---------- drop a photo onto the poster ---------- */
  const card = previewCanvas.parentElement;
  const hasFile = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const setDrop = (on) => {
    overlay.classList.toggle('is-drop', on);
    poster.dropActive = on; // the ring is part of the render, not an overlay
    if (on) showOverlay(true);
  };

  for (const ev of ['dragenter', 'dragover']) {
    card.addEventListener(ev, (e) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDrop(true);
    });
  }
  card.addEventListener('dragleave', (e) => {
    if (!card.contains(e.relatedTarget)) {
      setDrop(false);
      showOverlay(false);
    }
  });
  card.addEventListener('drop', (e) => {
    if (!hasFile(e)) return;
    e.preventDefault();
    setDrop(false);
    acceptFile(e.dataTransfer.files?.[0]);
  });

  /* A drag can end without the card ever seeing a dragleave — dropped somewhere
     else, cancelled with Escape, or dragged back out to the desktop. Any of
     those used to strand the ring on, and once stranded it looked like a plain
     hover state. These are the ways out. */
  for (const ev of ['dragend', 'drop', 'dragexit']) {
    document.addEventListener(ev, () => {
      setDrop(false);
      showOverlay(false);
    });
  }
  window.addEventListener('blur', () => setDrop(false));

  /* Without this the browser navigates away to the image when a drop misses the
     card — which loses whatever the person had already set up. */
  for (const ev of ['dragover', 'drop']) {
    document.addEventListener(ev, (e) => {
      if (!card.contains(e.target)) e.preventDefault();
    });
  }
}

/* ---------- the sheet, on phones ---------- */
{
  const sheet = $('sheet');
  const grab = $('sheetGrab');
  const opener = $('sheetOpen');
  const setSheet = (open) => {
    document.body.classList.toggle('sheet-open', open);
    grab.setAttribute('aria-expanded', String(open));
    opener.setAttribute('aria-expanded', String(open));
    if (open) sheet.scrollTop = 0;
  };
  /* Closed to begin with: the poster is what someone came to see, and on a
     phone an open editor hides most of it behind controls they have not asked
     for yet. The yellow pill is the invitation. */
  setSheet(false);
  grab.addEventListener('click', () => setSheet(false));
  opener.addEventListener('click', () => setSheet(true));

  /* A flick on the handle does what a flick should, without dragging the sheet
     under the finger — the sheet scrolls its own content, and tracking both
     would fight. */
  let startY = null;
  grab.addEventListener('pointerdown', (e) => { startY = e.clientY; });
  grab.addEventListener('pointerup', (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    startY = null;
    if (Math.abs(dy) > 24) setSheet(dy < 0);
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
const filename = (ext) =>
  `ddx${editionInput.value ? '-' + editionInput.value : ''}-${variant().slug}-${slug()}.${ext}`;

function setStatus(msg) {
  statusEl.hidden = !msg;
  statusEl.textContent = msg ?? '';
}

async function run(button, job) {
  if (exporting) return;
  exporting = true;
  const all = [mp4Btn, pngBtn, gifBtn, $('dockSave'), $('shareBtn'), $('shareBtnImage')];
  for (const b of all) b.disabled = true;
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
    for (const b of all) b.disabled = false;
    exporting = false;
  }
}

/* The jobs are named so more than one button can start them. The phone's
   collapsed dock has its own save button, and progress has to appear on
   whichever button was actually pressed — the one in the sheet is off-screen. */
/* Making the file and delivering it are separate on purpose: the buttons in the
   editor always save, the share button always offers the OS sheet, and the one
   on the dock does whichever this browser can manage. */
const make = {
  png: () => toPng(poster),
  gif: (p) => toGif(poster, p),
  mp4: (p) => (hasMp4() ? toMp4(poster, p) : toWebm(poster, p)),
};
const extFor = (kind) => (kind === 'mp4' && !hasMp4() ? 'webm' : kind);

const saveJob = (kind) => async (p) => {
  if (kind === 'mp4' && !hasMp4()) setStatus('This browser has no MP4 encoder — exporting WebM instead.');
  download(await make[kind](p), filename(extFor(kind)));
};

/* Hand it to the OS. Falls back to saving when the browser declines — Safari
   wants share() inside the user gesture and an export runs past it, so a refusal
   is expected rather than exceptional. */
const shareJob = (kind) => async (p) => {
  const blob = await make[kind](p);
  const name = filename(extFor(kind));
  const how = await shareFile(blob, name, variant().title);
  if (how === 'shared' || how === 'cancelled') return;
  download(blob, name);
};

pngBtn.addEventListener('click', () => run(pngBtn, saveJob('png')));
gifBtn.addEventListener('click', () => run(gifBtn, saveJob('gif')));
mp4Btn.addEventListener('click', () => run(mp4Btn, saveJob('mp4')));

/* The share button only exists where the OS can actually take a file. */
for (const [id, kind] of [['shareBtnImage', 'png'], ['shareBtn', 'mp4']]) {
  const btn = $(id);
  if (!canShareFiles()) continue;
  btn.hidden = false;
  btn.addEventListener('click', () => run(btn, shareJob(kind)));
}

{
  const save = $('dockSave');
  const primary = () => (currentMode() === 'video' ? 'mp4' : 'png');
  /* Only the label, never the button — writing textContent on the button would
     take the icon with it. */
  const shares = canShareFiles();
  const syncDock = () => {
    const kind = extFor(primary()).toUpperCase();
    $('dockSaveLabel').textContent = shares ? `Share ${kind}` : `Download ${kind}`;
  };
  $((shares ? 'dockShareIcon' : 'dockSaveIcon')).removeAttribute('hidden');
  save.addEventListener('click', () => run(save, (shares ? shareJob : saveJob)(primary())));
  for (const i of modeInputs) i.addEventListener('change', syncDock);
  syncDock();
}
