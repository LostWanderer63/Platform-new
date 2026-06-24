# Aurora — Game Cover Image Prompts (for Stitch / image-gen MCP)

Generate one cover per game. Output **3:4 portrait PNG**, recommended **1024 × 1365** (or 896 × 1152).
Save each as `public/games/<id>.png` — the app already loads that path (overwrites the generated placeholder).
No code change needed. Optionally set `img: "<url>"` on a game in `src/data/mock.ts` instead.

---

## GLOBAL STYLE (prepend to every prompt)

> Premium AAA game-launcher cover art, immersive dark theme, cinematic depth, glassmorphism,
> ambient gradient lighting, soft volumetric glow, subtle particle sparkles, rich color grading,
> centered hero subject, dramatic rim light, high detail, polished 3D-render / digital-illustration
> hybrid, vibrant but elegant (no neon overload), portrait 3:4 composition, thumbnail-friendly,
> studio-grade. Mood: luxury, excitement, trust.

## NEGATIVE PROMPT (every image)

> text, words, letters, numbers, logos, watermark, signature, UI, buttons, frame, border,
> low quality, blurry, jpeg artifacts, distorted, extra limbs, cluttered, busy background,
> real brand logos, trademarked characters

## GEN PARAMS

- Aspect: `3:4` · Size: `1024x1365` · Format: `PNG` · Steps: high/quality
- Keep lighting direction top-left, subject centered, dark vignette bottom (for card legibility)
- Per-game accent hue noted in `[brackets]` — bias the lighting/glow to that hue

---

## ORIGINALS

**crash.png** `[lime-gold glow]`
> A sleek glowing rocket blasting upward along a luminous exponential curve trail, deep space
> backdrop with faint stars, motion energy, golden-green light streaks, explosive ascent.

**dice.png** `[lime glow]`
> Two glowing casino dice tumbling in mid-air, crisp white faces with luminous pips, energy
> sparks and light trails around them, dark reflective surface below.

**mines.png** `[green-teal glow]`
> A glowing bomb resting on a grid of dark gem-like tiles, one brilliant diamond revealed
> nearby, tense dramatic spotlight, sparks on the fuse.

**plinko.png** `[cyan glow]`
> A neon pegboard with a single glowing ball cascading down through illuminated pins toward
> bright multiplier slots, kinetic light trails, dark arcade depth.

**roulette.png** `[blue-violet glow]`
> Close-up of a spinning roulette wheel with a glowing ball, gold and accent segments, motion
> blur on the rim, luxury casino lighting, polished metal.

**wheel.png** `[violet glow]`
> A vibrant segmented wheel-of-fortune seen head-on, glowing wedges in jewel tones, a golden
> pointer at top, radiant center hub, celebratory light burst.

**coinflip.png** `[magenta-gold glow]`
> A single golden coin spinning in mid-air with a luminous star emblem, sweeping light arcs
> tracing its motion, dark elegant backdrop, shimmering reflections.

**blackjack.png** `[gold glow]`
> An ace and king playing card crossed over a stack of glowing casino chips, dark luxury felt,
> warm gold rim light, premium and sophisticated.

---

## SLOTS  (themed originals — keep generic, no trademarked characters/logos)

**slot-0.png** — Gates of Olympus theme `[teal glow]`
> A majestic ancient Greek marble temple atop clouds, golden divine lightning crackling down,
> glowing gemstones, epic god-of-thunder ambiance, radiant sunbeams.

**slot-1.png** — Sweet Bonanza theme `[teal-cyan glow]`
> A joyful candy world: glossy lollipops, jelly fruits, sugar hearts and gumdrops floating,
> pastel-meets-vibrant palette, sweet glossy 3D render, playful sparkles.

**slot-2.png** — Sugar Rush theme `[blue glow]`
> A bright candyland of stacked gummy blocks, frosted donuts and rainbow sweets, glossy pink
> and blue tones, fizzy energetic mood, sugar sparkle particles.

**slot-3.png** — Big Bass theme `[violet-blue glow]`
> A large leaping bass fish breaking a moonlit lake surface, water splash, fishing lure glint,
> serene night sky, cool cinematic light.

**slot-4.png** — Wanted theme `[pink-red glow]`
> A dusty wild-west desert at golden hour, a lone cowboy silhouette, revolver and bounty
> tokens, dramatic sun flare, gritty cinematic depth.

**slot-5.png** — Money Train theme `[amber glow]`
> A steampunk locomotive charging forward overflowing with gold coins and cash, sparks and
> steam, industrial metal, glowing furnace light.

**slot-6.png** — Wild West theme `[lime glow]`
> A weathered saloon and desert canyon backdrop, revolver, sheriff star, tumbleweed, warm
> sunset palette, rugged frontier atmosphere.

**slot-7.png** — Starlight theme `[green glow]`
> A cosmic scene of glowing constellations and floating jewel-toned gems, deep space nebula,
> stardust sparkles, ethereal luxurious glow.

---

## LIVE CASINO

**live-0.png** — Lightning Roulette `[violet glow]`
> A roulette wheel charged with electric blue-violet lightning bolts striking numbers, dramatic
> studio spotlight, energy and luxury, glowing accents.

**live-1.png** — Crazy Time `[magenta glow]`
> A giant colorful carnival game-show money wheel under bright studio lights, festive bulbs,
> confetti sparkle, high-energy playful broadcast vibe.

**live-2.png** — Mega Wheel `[red-magenta glow]`
> A massive vertical money wheel with glowing multiplier segments, dramatic stage lighting,
> deep studio backdrop, anticipation and grandeur.

**live-3.png** — Blackjack VIP `[gold glow]`
> A luxurious private blackjack table with fanned cards and tall stacks of gold chips, warm
> spotlight, dark velvet surroundings, exclusive premium mood.

**live-4.png** — Baccarat `[amber glow]`
> An elegant baccarat table with playing cards and golden chips, refined low-key lighting,
> marble and gold accents, sophisticated high-roller atmosphere.

**live-5.png** — Monopoly Live `[lime glow]`
> A playful board-game world with a top hat, oversized dice, stacks of play money and houses,
> bright cheerful studio light, fun premium 3D render.

---

## INTEGRATION

1. Generate all 22 → name exactly `<id>.png` (ids above).
2. Drop into `public/games/` (replaces generated placeholders).
3. `npm run dev` — covers load automatically (`GameImage` reads `/games/<id>.png`).
4. Missing/failed file → app falls back to built-in SVG art, so partial sets are safe.

**MCP note:** if your image MCP returns URLs instead of files, set `img: "<url>"` per game in
`src/data/mock.ts` (the `img` field already overrides the local PNG path).
