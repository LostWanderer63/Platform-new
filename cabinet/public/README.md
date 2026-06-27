# Game art (drop-in)

Professional artwork goes here as image files — the game loads them automatically
on reload and falls back to the (placeholder) procedural graphics if they're absent.
Nothing in code needs to change.

## Background

Drop one of these in `public/` (first match wins), sized **1920×1080**:

```
background.png   background.jpg   bg.png   bg.jpg
```

If none is present, the procedural "temple" background is used.

## Symbols

Drop per-symbol art in `public/symbols/<id>.png` (square, ~360×360, transparent).
See `public/symbols/README.md` for the id list (zeus, poseidon, athena, crown,
sword, gems, wild, orb).

## Where to get artwork

These must be real images (hand-drawn / 3D-rendered / AI-generated / licensed).
Code-drawn vector graphics cannot reach that quality — that is what the temple and
the symbol tiles currently are: placeholders. Replace them with real PNG/JPG here.
