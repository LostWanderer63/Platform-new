# Wrath of Olympus — Art Prompt Pack

Copy-paste prompts to generate matching, professional art (Midjourney / DALL·E /
SDXL / Firefly). Each output is saved to the **exact filename** the game loads —
drop them in and reload, no code changes.

- Symbols → `public/symbols/<id>.png` — **512×512**, transparent background.
- Background → `public/background.png` — **1920×1080**.

---

## How to get the images for free (no artist, no images yet)

You don't have art — generate it with these prompts in a **free** tool, or grab a
ready-made pack. The game runs on placeholders until you do, so there's no rush.

### Option A — free AI generators (use the prompts below)
- **Bing Image Creator** (bing.com/create) — free DALL·E 3, best at these prompts.
- **Google ImageFX** (labs.google/fx) — free, great for the 16:9 background.
- **Leonardo.ai** — free tier, game-art models + built-in background remover.
- **Ideogram** — free, clean results.

Steps:
1. Open one tool, paste a **symbol prompt** (one at a time), generate, download the
   best (≥512px).
2. Symbols need a **transparent background**: run the download through
   **remove.bg** (free) or **Photopea** (free), export as PNG.
3. Rename to the exact id, e.g. `zeus.png`, and put in `public/symbols/`.
4. Background: use the **16:9 prompt** in ImageFX, download, save as
   `public/background.png` (1920×1080, no transparency needed).
5. `npm run dev`, hard-reload. Repeat per symbol — add them one at a time.

### Option B — ready-made asset packs (fastest)
Search these for "Greek / Olympus / Zeus slot symbols":
- **craftpix.net** (has free + paid Greek-mythology slot symbol sets — drop-in)
- **itch.io** game assets, **opengameart.org** (check the license)
- **GraphicRiver / Envato**

Rename the pack files to the ids below (`zeus.png`, `poseidon.png`, …) and drop in
`public/symbols/`; use their background as `public/background.png`.

---

## 0) Shared style (keep every asset consistent)

Paste this **STYLE BLOCK** into every prompt so all assets match:

> ancient Greek mythology, Mount Olympus theme, premium AAA online slot game art,
> ornate gold filigree and white marble, carved relic icon, dramatic cinematic
> rim lighting, deep teal-and-royal-purple night palette with warm gold accents,
> volumetric god-rays, highly detailed painterly digital illustration, centered
> composition, clean silhouette, subtle inner glow, 8k, sharp focus

**Negative prompt (all assets):**

> text, watermark, signature, logo, blurry, lowres, jpeg artifacts, flat lighting,
> washed out, extra limbs, deformed hands, busy background, photo, 3d render seams

**Consistency tips**
- Lock one **seed** / use a **style reference** image across all symbols so the
  frame, lighting direction (top-left key light) and gold tone match.
- Symbols: same **ornate stone-and-gold frame**, same camera framing, icon fills
  ~80% of the canvas, transparent outside the frame.
- Midjourney: append `--ar 1:1 --style raw --q 2` (symbols) / `--ar 16:9` (bg).
- SDXL: 1024×1024 then downscale to 512; export PNG with alpha.

---

## 1) Symbols (512×512, transparent PNG)

### `public/symbols/zeus.png` — Zeus (top symbol)
> [STYLE BLOCK] portrait of Zeus king of the gods, powerful bearded elder, glowing
> white-blue eyes, crackling lightning around his fist, laurel-and-gold crown,
> framed in an ornate gold-and-marble slot tile with a name banner reading space
> at the bottom, legendary gold frame

### `public/symbols/poseidon.png` — Poseidon
> [STYLE BLOCK] portrait of Poseidon god of the sea, teal beard and flowing hair,
> golden trident, swirling water and foam, framed in an ornate silver-and-marble
> slot tile, epic frame

### `public/symbols/athena.png` — Athena
> [STYLE BLOCK] portrait of Athena goddess of wisdom, golden Corinthian helmet with
> tall crest, calm noble face, small owl on her shoulder, framed in an ornate
> silver-and-marble slot tile, epic frame

### `public/symbols/crown.png` — Crown (mid symbol)
> [STYLE BLOCK] a single ornate golden royal laurel crown encrusted with sapphires,
> floating, soft glow, framed in a bronze-and-marble slot tile, no face

### `public/symbols/sword.png` — Sword (mid symbol)
> [STYLE BLOCK] an ornate ancient Greek xiphos sword, golden hilt with laurel
> engraving, gleaming steel blade pointing up, framed in a bronze-and-marble slot
> tile, no face

### `public/symbols/gems.png` — Gems (low symbol)
> [STYLE BLOCK] a cluster of polished emerald and amethyst gemstones, faceted,
> sparkling highlights, framed in a stone-and-bronze slot tile, no face

### `public/symbols/wild.png` — Wild
> [STYLE BLOCK] an Olympus crest WILD symbol, golden laurel wreath around a radiant
> lightning sigil, ribbon banner space for the word WILD, legendary gold frame,
> the most premium tile of the set

### `public/symbols/orb.png` — Lightning Orb (scatter)
> [STYLE BLOCK] a glowing crystal orb crackling with violet lightning, the SCATTER
> symbol, floating with electric arcs, intense inner glow, legendary gold frame

---

## 2) Background — `public/background.png` (1920×1080)

> [STYLE BLOCK minus "centered composition, clean silhouette"] a grand Mount Olympus
> temple interior at night, towering fluted marble columns left and right framing a
> central empty space for a slot reel grid, gold-trimmed pediment roof above, storm
> clouds and lightning in a deep purple sky behind the columns, glowing braziers,
> volumetric god-rays pouring down the center, marble floor with gold inlay, epic
> cinematic wide shot, leave the middle third darker and uncluttered for UI overlay
> --ar 16:9

**Important for the background**
- Keep the **center third darker / emptier** — the 5×4 reel grid sits there.
- Avoid bright detail or text in the center (it competes with the reels).
- 1920×1080 exact; the engine stretches it to fill.

---

## 3) Optional extras (future)
- `public/symbols/<id>_win.png` — a brighter "win" variant per symbol (not wired
  yet; ask and I'll add a win-texture swap).
- Spine skeletons (`<id>.json` + `.atlas`) for animated gods — ask and I'll add
  `@pixi/spine` loading with the same auto-detect/fallback.

After dropping files: `npm run dev`, hard-reload. Missing files silently fall back
to the procedural placeholders, so you can add art one piece at a time.
