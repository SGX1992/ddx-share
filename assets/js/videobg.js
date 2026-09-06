/* The motion backgrounds. Same shape as the image manifest: an edition's own
   clips come first, then the generic ones from `_shared`, which every edition
   offers.

   Only the chosen clip is ever fetched. They are megabytes each, and loading
   them all to draw thumbnails would cost more than the whole rest of the page;
   the picker uses static poster stills instead. */

const DIR = 'assets/video';
const cache = new Map();
let manifestPromise = null;

const FALLBACK = [{ file: 'ddx-background.mp4', label: 'Motion', poster: null }];

const clean = (list) =>
  (Array.isArray(list) ? list : []).filter((c) => c && typeof c.file === 'string');

function manifest() {
  manifestPromise ||= fetch(`${DIR}/manifest.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return manifestPromise;
}

export async function clips(edition) {
  const m = await manifest();
  const list = [...clean(m[edition?.id]), ...clean(m._shared)];
  return list.length ? list : FALLBACK;
}

export const posterUrl = (clip) => (clip.poster ? `${DIR}/${clip.poster}` : null);

export function backgroundVideo(edition, index = 0) {
  const key = `${edition?.id || '-'}|${index}`;
  if (cache.has(key)) return cache.get(key);

  const p = (async () => {
    const list = await clips(edition);
    const clip = list[Math.min(Math.max(index, 0), list.length - 1)];
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.src = `${DIR}/${clip.file}`;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.addEventListener('canplay', () => resolve(v), { once: true });
      v.addEventListener('error', () => {
        console.warn(`[ddx] no background video at ${DIR}/${clip.file} — falling back to the still image.`);
        resolve(null);
      }, { once: true });
    });
  })();

  cache.set(key, p);
  return p;
}

/* Exports have to land on an exact frame, so they seek rather than watch the
   clip play. A seek to the time it is already at fires no `seeked` event, hence
   the timeout — without it an export would hang on the first frame. */
export function seek(video, t) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 1e-3) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    video.addEventListener('seeked', finish);
    setTimeout(finish, 400);
    video.currentTime = t;
  });
}
