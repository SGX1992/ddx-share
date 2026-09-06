# Motion background

One file, shared by every edition:

```
ddx-background.mp4
```

Used when someone picks **Video** — it becomes the background, and the download
options become MP4 and GIF. Nothing else reads it, so replacing this one file
changes every edition's video at once. If it is missing, Video mode quietly falls
back to the edition's still image and logs a warning.

**Make it 1080×1350 (4:5) or taller, H.264.** Drawn cover-fit, same as the stills. The
current file is 1280×720, which is landscape and short: it gets scaled 1.875× to fill
the portrait frame, so only the middle 45% of the width is used and every pixel is
nearly doubled. A portrait master would look markedly sharper.

**Keep it around 8 seconds.** Export time scales with length, and it happens in the
attendee's browser: the current 24-second clip takes ~42s to render an MP4 on a fast
Mac and lands at 8.3 MB. At 8 seconds that is roughly 14s and 3 MB. The MP4 bitrate is
budgeted to hold the file near 10 MB, so a longer clip buys length by giving up
quality.

**It must loop cleanly** — the export runs exactly one pass, first frame to last, so
a jump at the seam shows up in every MP4 and GIF people post.

**Keep it small.** It is only fetched when someone actually picks Video, but it is
still the heaviest thing on the page. Under ~5 MB is comfortable; a short clip that
loops beats a long one.

**The host must support HTTP Range requests.** Exports seek the video frame by frame,
and a server that answers with 200-and-the-whole-file instead of 206 leaves every
frame stuck at 0:00 — the MP4 comes out frozen. Netlify, Vercel, S3/CloudFront and
nginx all do this by default; the bundled `serve.mjs` does too.
