import { Muxer, ArrayBufferTarget } from './vendor/mp4-muxer.mjs';
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.mjs';
import { W, H } from './poster.js';

const FPS = 30;

export const hasMp4 = () => typeof VideoEncoder !== 'undefined';

/* Yield with a task, not a frame: rAF is throttled to a standstill in a
   background tab, and an export shouldn't stall because someone switched away. */
const breathe = () => new Promise((r) => setTimeout(r, 0));

/* Can this browser hand a file to the OS share sheet? That is the route to
   Instagram and friends — there is no reliable direct-to-Instagram web API, but
   Instagram shows up as a target in the native sheet, alongside Save to Photos.
   Feature-detected with a real file, because canShare({files}) is the only
   honest test: several browsers expose navigator.share but refuse files. */
export function canShareFiles(type = 'image/png') {
  try {
    const probe = new File([new Blob([1])], 'probe' + (type === 'video/mp4' ? '.mp4' : '.png'), { type });
    return Boolean(navigator.canShare?.({ files: [probe] }));
  } catch {
    return false;
  }
}

/* Resolves 'shared' | 'cancelled' | 'unsupported'. Anything else throws.

   Safari wants share() to happen inside the user gesture, and an export takes
   long enough to fall outside it — so a NotAllowedError here is expected, not a
   bug, and the caller falls back to a download. */
export async function shareFile(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type });
  if (!navigator.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
    if (err?.name === 'NotAllowedError') return 'unsupported';
    throw err;
  }
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function toPng(poster) {
  await poster.prepare(0);
  const c = poster.renderAt();
  poster.resume();
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'),
  );
}

/* One full 8s cycle, H.264 in MP4 — the format every social upload accepts. */
export async function toMp4(poster, onProgress) {
  const loop = poster.loopSeconds;
  const total = Math.max(1, Math.round(loop * FPS));
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H },
    fastStart: 'in-memory',
  });

  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      /* Chrome hands back a colorSpace with a null transfer for canvas frames,
         which the muxer refuses. Fill in the sRGB defaults it expects. */
      const cs = meta?.decoderConfig?.colorSpace;
      if (cs) {
        meta.decoderConfig.colorSpace = {
          primaries: cs.primaries ?? 'bt709',
          transfer: 'iec61966-2-1',
          matrix: cs.matrix ?? 'bt709',
          fullRange: cs.fullRange ?? false,
        };
      }
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => { failure = e; },
  });
  /* Budget the file rather than the bitrate: a fixed 8 Mbps turns a 24-second
     clip into a 24 MB download nobody wants to post. Cap the whole export at
     ~10 MB and let short clips keep the full quality. */
  encoder.configure({
    codec: 'avc1.640028',
    width: W, height: H,
    bitrate: Math.round(Math.min(8_000_000, 80_000_000 / Math.max(1, loop))),
    framerate: FPS,
  });

  for (let i = 0; i < total; i++) {
    if (failure) throw failure;
    await poster.prepare(i / FPS);
    const canvas = poster.renderAt();
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i * 1e6) / FPS),
      duration: Math.round(1e6 / FPS),
    });
    encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    if (i % 5 === 0) {
      onProgress?.(i / total);
      await breathe();
    }
  }

  await encoder.flush();
  encoder.close();
  poster.resume();
  if (failure) throw failure;
  muxer.finalize();
  onProgress?.(1);
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

/* Fallback for browsers without WebCodecs: record the live canvas for one cycle. */
export async function toWebm(poster, onProgress) {
  const loop = poster.loopSeconds;
  const stream = poster.canvas.captureStream(FPS);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
  const parts = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));

  /* Real time, not seeked: MediaRecorder records the canvas as the clock runs,
     so the clip has to actually play alongside it. */
  poster.resume();
  rec.start();
  const t0 = performance.now();
  await new Promise((done) => {
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= loop) return done();
      poster.renderAt();
      onProgress?.(t / loop);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  rec.stop();
  await stopped;
  onProgress?.(1);
  return new Blob(parts, { type: 'video/webm' });
}

/* A short, seamless GIF: the same cycle resampled to 24 frames. One palette for
   the whole animation keeps the file small and stops the colours from crawling. */
export async function toGif(poster, onProgress) {
  const loop = poster.loopSeconds;
  /* A GIF of a long clip has to choose between frame rate and file size. Hold
     the playback rate at a watchable ~8fps and cover as much of the loop as that
     allows, rather than stretching 24 frames across the whole thing at 1fps. */
  const DELAY = 120;
  const FRAMES = Math.min(48, Math.max(12, Math.round((loop * 1000) / DELAY)));
  const span = Math.min(loop, (FRAMES * DELAY) / 1000);
  const gw = 540;
  const gh = Math.round((gw * H) / W);

  const scratch = document.createElement('canvas');
  scratch.width = gw;
  scratch.height = gh;
  const sc = scratch.getContext('2d', { willReadFrequently: true });

  const grab = async (i) => {
    await poster.prepare((i / FRAMES) * span);
    sc.drawImage(poster.renderAt(), 0, 0, gw, gh);
    return sc.getImageData(0, 0, gw, gh).data;
  };

  /* Build the palette from two frames half a cycle apart so a colour that only
     shows up on the far side of the loop still gets a slot. */
  const first = await grab(0);
  const mid = await grab(Math.floor(FRAMES / 2));
  const sample = new Uint8ClampedArray(first.length + mid.length);
  sample.set(first, 0);
  sample.set(mid, first.length);
  const palette = quantize(sample, 256, { format: 'rgb565' });

  const gif = GIFEncoder();
  for (let i = 0; i < FRAMES; i++) {
    const data = i === 0 ? first : await grab(i);
    gif.writeFrame(applyPalette(data, palette, 'rgb565'), gw, gh, {
      palette: i === 0 ? palette : undefined,
      delay: DELAY,
      repeat: 0,
    });
    onProgress?.((i + 1) / FRAMES);
    await breathe();
  }
  gif.finish();
  poster.resume();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
