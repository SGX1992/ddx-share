/* The shared motion background. One generic clip for every edition — it is only
   fetched when someone actually picks Video, because it is several megabytes and
   most visitors will only ever export a PNG. */

const SRC = 'assets/video/ddx-background.mp4';
let cached = null;

export function backgroundVideo() {
  if (cached) return cached;
  cached = new Promise((resolve) => {
    const v = document.createElement('video');
    v.src = SRC;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.addEventListener('canplay', () => resolve(v), { once: true });
    v.addEventListener('error', () => {
      console.warn(`[ddx] no background video at ${SRC} — falling back to the still image.`);
      resolve(null);
    }, { once: true });
  });
  return cached;
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
