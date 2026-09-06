# DDX — "I am going" poster builder

Attendees pick an edition, drop in a photo, type their name, and export a share-ready
poster for the DDX tour.

Static site, **no build step**. Serve the folder:

```bash
node serve.mjs
```

…then open <http://localhost:8791>. `serve.mjs` is dev-only (ES modules won't load over
`file://`); deployment is a plain static upload — Netlify, S3, anything.

## Two formats

A switch at the top of the panel picks **Image** or **Video**, and that choice drives
both the background and the download buttons:

| | Background | Downloads |
| --- | --- | --- |
| **Image** | the edition's still, from `assets/img/bg/` — several shots per city, picked with thumbnails | PNG |
| **Video** | the shared clip, `assets/video/ddx-background.mp4` | MP4 · GIF |

Image mode is deliberately motionless — it only ever exports a PNG, so animating the
preview would just make that PNG's crop a lottery. Video mode adds no motion of its
own either; the footage already moves.

## The poster

1080×1350 (4:5 — the Instagram/LinkedIn portrait size). Layered back to front:

1. the edition's **background photo**, cover-fit, with a slow ±3.5% push-in
2. a **black wash** plus a top-down darkening, then a fall to solid black across the middle
3. **I AM GOING** — set to a fixed width, positioned so the card crops its lower edge
4. the **portrait card**, a rounded rect with the photo cover-fit inside it and a gradient
   that takes it to black at the bottom
5. the **date** (over the card's fade), **DDX <CITY>**, and the **name**
6. the footer: `DDXCONFERENCE.COM` and the DDX wordmark
7. the **brand wash** — a white-to-yellow gradient in `multiply` over the whole
   poster, type included, so the image and the text sit in one light

Everything is type-fitted: each line is measured at a probe size and scaled to its width
budget, so `DDX SAN DIEGO` and `DDX MIAMI` both sit inside the same margins instead of one
overflowing. `L` at the top of `poster.js` is the whole layout — widths, gaps, caps.

Exports run exactly one pass of the clip, so they loop seamlessly:

| Format | Size | Notes |
| --- | --- | --- |
| PNG | 1080×1350 | single frame |
| MP4 | 1080×1350, 30fps, clip length | WebCodecs H.264 + `mp4-muxer` |
| GIF | 540×675, 24 frames | one shared palette |

Browsers without WebCodecs fall back to a `MediaRecorder` WebM.

## Background artwork

**`assets/img/bg/` — see the README in that folder.** `manifest.json` lists the shots
each edition offers; more than one and a thumbnail picker appears under the Format
switch. An edition missing from the manifest falls back to a file named after its id
(`miami.avif`), then to `default.*`, then to a drawn gradient, so nothing ever breaks.

Either drop files in by hand, or sync them from Notion.

## Syncing from Notion

The tour lives in Notion under **DDX → Events**
(data source `2289967f-86f3-8035-8430-000b8a3c0891`), where each row carries a
**Key Background Visual** file property.

```bash
NOTION_TOKEN=ntn_xxx node sync-notion.mjs --dry-run   # show what would change
NOTION_TOKEN=ntn_xxx node sync-notion.mjs             # write it
```

It rewrites `assets/js/editions.js` and downloads each background into
`assets/img/bg/<id>.<ext>`. The token is an internal integration token from
notion.so/profile/integrations, with the Events database shared to it.

**Why a token and not the MCP connector:** the connector reads the database fine, but a
file property comes back as an opaque `file://` reference — no bytes, no signed URL.
Only the REST API returns the signed download URL. Those URLs expire about an hour after
they are issued, so the query and the download have to happen in the same run.

**Which rows become editions:** anything with a date, whose Status isn't `Idea`, that
hasn't already happened. The database also holds roundtables (`DDX London - Roundtable`,
`DDX LR Dubai`), one-off ideas, and past events. Adjust `SKIP_STATUS` / `INCLUDE_PAST` at
the top of the script.

**This script has not been run against the live API** — there was no token available when
it was written. Use `--dry-run` first.

## Editions

`assets/js/editions.js` is the only place the tour lives — the picker, the poster
headline, the date line, the background lookup and the export filename all read from it.

Current list, in tour order: San Diego 17 Sep 2026 · Miami 25 Sep 2026 · London 20 Nov
2026 · Dubai 27–28 Jan 2027 · Tokyo 12 Feb 2027 · Munich 15 May 2027 · New York 25 Jun
2027. All confirmed by Sebastian.

Two things to know if you compare against other sources: the public site still said
"Announcement soon" for Dubai when these went in, so this tool announces that date
first. And the Notion rows for New York (12 Jun 2026) and Munich (9 May 2026) are both
a year stale against the dates above.

## Share links

Fields prefill from the query string, so a "make yours" link can arrive half-filled:

```
?name=Anja%20Popvic&edition=miami
```

`edition` takes an id from `editions.js`. Photos are never accepted from the URL — only
from the file picker or the camera, and they never leave the browser.

## How it's put together

```
index.html
serve.mjs            dev server only
assets/css/style.css
assets/img/bg/       edition backgrounds (see its README)
assets/js/
  main.js            DOM wiring, photo input, card dragging, export buttons
  poster.js          the layout and the render
  brand.js           colours, font, type fitting and hand-drawn letter tracking
  backgrounds.js     per-edition image lookup with fallbacks
  editions.js        the tour
  exporters.js       PNG / MP4 / GIF / WebM
  vendor/            mp4-muxer 5.2.1, gifenc 1.0.3 (checked in, no package manager)
archive/ring-badge/  the first take — see its README
```

### Things that will bite you

**Text is measured with the real font, so nothing renders before `document.fonts.load`
resolves.** Skip that await and every fitted size is computed for Arial, then re-flows.

**Tracking is drawn character by character.** Safari has no canvas `letterSpacing`, so
`drawTracked` positions each glyph itself. Any new tracked line must go through it, and
any width calculation must use `trackedWidth` — `measureText` alone will be wrong.

**Vertical positions come from the measured cap height, not a font constant.** Swapping
the typeface re-measures and keeps the layout; hard-coding an em fraction would not.

**Draw order carries the design.** The headline must be painted *before* the card — that
crop is what gives the poster its depth. Moving it after flattens the whole thing.

**`setData` is async** because it may need to fetch a background or the video. Await it
before exporting, or the first frame can go out with the previous edition's image.

**Video exports seek; they do not record.** `poster.prepare(t)` parks the clip on an
exact frame and `renderAt()` draws it, which is the only way a frame lands where it
should. That makes HTTP Range support a hard requirement of wherever this is hosted —
a server that answers a range request with the whole file leaves `currentTime` pinned
at 0 and every exported frame identical. The bundled `serve.mjs` supports ranges for
exactly this reason; it was written without them first, and the MP4 came out frozen.

**The background cache is keyed by edition id.** Drop in a new file and it won't appear
until reload — or call `forget(id)` from `backgrounds.js`.

## Going public — share.ddxconference.com

It is a static folder with no build step and no backend, so any static host works.
`netlify.toml` is set up for Netlify; the cache headers are the part worth keeping if
you move elsewhere.

**A subdomain cannot break the main site.** `ddxconference.com` and `www` resolve
through their own records; adding a `share` record leaves those untouched. The only
dangerous edit would be changing the apex A records or the `www` CNAME — don't, and
in particular **do not point the domain's nameservers at Netlify**, which would move
all DNS off Squarespace and take the main site with it.

DNS for this domain is on Squarespace (`ns01–04.squarespacedns.com`).

1. Deploy the folder — drag it onto app.netlify.com, or `netlify deploy --prod`.
   Netlify gives it a name like `ddx-share.netlify.app`.
2. In Netlify: Domain management → Add a domain → `share.ddxconference.com`.
3. In Squarespace: Settings → Domains → ddxconference.com → DNS Settings →
   Add record: **CNAME**, host `share`, data `ddx-share.netlify.app`.
4. Wait for it to resolve (`dig +short share.ddxconference.com`), then let Netlify
   issue the certificate. Nothing else changes.

Two things the host has to do, both of which Netlify, Vercel, S3/CloudFront and nginx
all do by default:

- **serve HTTP Range requests** (206), or video exports come out frozen — see above
- **serve `.avif` and `.mp4` with the right `Content-Type`**

**Bandwidth.** The video is fetched on nearly every visit, so it dominates: at ~4 MB
that is roughly 24,000 visits inside Netlify's 100 GB free tier. Trimming the clip is
the cheapest lever on both bandwidth and export time.

Everything happens in the visitor's browser: photos are never uploaded, nothing is
stored, and there is no API key in the page. The only outbound request is the Google
Fonts stylesheet.

Before it goes in front of attendees, make sure every edition in the picker has a
background in `assets/img/bg/` — a missing one falls back to a drawn gradient, which
is fine for a work-in-progress but not for a public link.

## Partner logos

An edition can carry a strip of partner marks printed under the name — see
`partners` in `editions.js`. Only San Diego has one.

**White marks on transparent, wide and short.** The file is scaled to a fixed
width (`partnersMaxW`), so the aspect ratio decides the height.

If what you have is white logos on a dark background, the alpha can be lifted
straight out of the luminance: set every pixel to white and use its brightness as
the alpha. The catch is that a strip like this is rarely uniformly black — the
first pass here left a faint panel behind several marks, visible only once the
strip sat on a photo. The fix is a floor: crush everything below ~62 luminance to
fully transparent and smoothstep the ramp above it, which kills the panels while
keeping the antialiasing. Check the result on mid-grey, not on black, or you will
not see what you left behind.

## Assets

- `assets/img/ddx-wordmark.png` — the official DDX wordmark, white on transparent.
- `assets/img/og-image.png` — 1200×630 link preview, generated from the poster renderer.
  Regenerate if the design or copy changes.
- The default photo is **drawn, not shipped** — no stock face to license.

## Fonts

**Helvetica Neue leads the stack**, so macOS and iOS render the real DDX typeface. It
isn't installed on Windows or Android, where **Inter** takes over from Google Fonts —
close enough in the grotesque department that the poster still reads as DDX.

Two consequences worth knowing:

- **A poster is not byte-identical across platforms.** The layout copes because every
  line is measured and fitted at render time rather than positioned at fixed sizes.
- **Display weights stop at 700.** macOS ships Helvetica Neue no heavier than Bold, so
  asking for 800 would get a synthesised fake. `DISPLAY_WEIGHT` in `brand.js` sets it.

Licensing a Helvetica Neue webfont would remove the split entirely — drop the file in,
add an `@font-face`, and the Inter fallback stops being reachable.

## Motion

Two separate systems, because the page and the poster are different media.

**The panel is CSS**, driven by a `.ready` class that `main.js` adds once the webfont has
landed and the first frame is drawn — otherwise the controls would deal themselves in
around an empty white rectangle. Each panel child carries a `--i` index that staggers it.
Only `transform` and `opacity` animate, and every rule sits inside a
`prefers-reduced-motion: no-preference` guard.

**The poster is canvas**, so it cannot use CSS at all — it assembles itself by drawing
each layer at a different point on a five-second timeline. `CUE` at the top of
`poster.js` is that timeline: a start and end fraction per layer, eased, with each one
fading up and sliding a few pixels into place. The headline is cued early and the card
late on purpose, so you watch the card crop into the type — the layering that makes the
poster work is the first thing it shows you.

**Exports never see the intro.** `run()` in `main.js` calls `poster.skipIntro()` before
handing off, so a PNG taken two seconds after page load is still the finished poster.
`layer()` also returns early at full progress, so a completed frame costs exactly what it
did before the intro existed — which matters when a 24-second MP4 runs it 720 times.
