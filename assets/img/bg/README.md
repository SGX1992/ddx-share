# Background artwork

One image per edition, named after its `id` in `assets/js/editions.js`. `.avif` is
checked first, then `.jpg`, `.png`, `.webp`. Nothing else needs editing — drop a file
in and the matching edition picks it up on the next load.

**`manifest.json` decides what each edition offers.** An entry per edition id, listing
its shots in order — the first is the default, and if there is more than one they appear
as a picker under the Format switch in the UI. Adding an option is two steps: drop the
file in this folder, add a line to the manifest.

```json
"san-diego": [
  { "file": "san-diego.jpg",   "label": "Sunset Cliffs" },
  { "file": "san-diego-3.jpg", "label": "Balboa Park" },
  { "file": "san-diego-2.jpg", "label": "Coastline" }
]
```

`label` is what shows on the tile, so keep it to a word or two. An edition with no
manifest entry still works — it falls back to probing `<id>.avif/.jpg/.png/.webp`, so a
single file dropped in with the right name needs no manifest at all.

**`_shared` is appended to every edition.** That is where the neutral abstract renders
live, so each city offers its own photography first and then the same fallback set.
Adding one there adds it everywhere at once.

**What's here now**

| File | Shot |
| --- | --- |
| `san-diego.jpg` | Sunset Cliffs — **portrait, 1200×1601**, the reference for how these should be shot |
| `san-diego-3.jpg` | Balboa Park, lily pond — portrait |
| `san-diego-2.jpg` | Beach from above with the coastal railway — 4:3, keeps ~60% of the width |
| `miami.avif` | Miami Beach, palms — landscape, upscaled 1.42× |
| `miami-2.jpg` | Ocean Drive at dusk, neon — portrait |
| `miami-3.jpg` | Art Deco façade — portrait |
| `miami-4.avif` | Two palms — **Unsplash+ premium, only the 387px preview was available**, so it upscales 2.79× |
| `new-york.avif` | Central Park from the north, Midtown behind |
| `dubai.avif` | Burj Al Arab from the air |
| `tokyo.avif` | Tokyo skyline with the Skytree |
| `tokyo-alt.avif` | Mt Fuji + Chureito Pagoda — offered as Tokyo's second option |
| `munich.avif` | Olympiapark |

| `london.jpg` | Tower Bridge with the City behind |
| `london-2.jpg` | Big Ben and the Boadicea statue |
| `london-3.jpg` | The Thames from the air at dusk |

| `neutral-1.png` | Ember — dark curve with an orange edge (shared) |
| `neutral-2.png` | Glow — soft blue-white light (shared) |
| `neutral-3.png` | Onyx — black gloss (shared) |

**Missing: `default.*`.** Every edition in the picker now has its own artwork, but there
is still no backup for anything added later.

**Shoot or crop these portrait — 1080×1350 (4:5) or taller.** They are drawn cover-fit,
so a 16:9 landscape source loses most of its width: the remaining 1280×854 files end up
scaled 1.58× with only the middle ~53% of the frame visible. Whatever made the shot
worth choosing needs to survive that crop, and at that scale it is also being upscaled,
which costs sharpness.

`san-diego.jpg` is the counter-example and the one to copy: 1200×1601 portrait, so it
is drawn at 0.9× — downscaled, sharp, and almost none of the frame is thrown away.

Only the **top ~28%** is really seen — below that the poster falls away to solid black,
and the middle is covered by the portrait card. Put the recognisable part of the city
high in the frame and near the horizontal centre.

The poster lays a 12% black wash plus a top-down darkening over whatever is here, so
bright, high-contrast photography survives; very dark images will read as almost black.

**Everything then gets the brand wash** — a white-to-yellow ramp painted in `multiply`
across the finished poster, so the right-hand side warms toward DDX yellow. Anything
strongly blue or cyan on that side will shift noticeably; black is unaffected.

With no file present the poster draws a tinted gradient stand-in, so nothing looks
broken while the photography is still being made. There is no longer a note in the UI
about it — the page is public-facing — so check the picker before launch.

These are only used in **Image** mode. Video mode uses the single shared clip in
`assets/video/`.
