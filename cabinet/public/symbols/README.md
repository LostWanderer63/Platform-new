# Symbol art (drop-in)

Drop a PNG here named `<symbolId>.png` and the game uses it automatically on the
next reload. Any id without a file falls back to the procedural ornate tile.

Recommended: square, ~360×360px, transparent background.

Expected ids:

| id         | symbol         |
|------------|----------------|
| `zeus`     | Zeus           |
| `poseidon` | Poseidon       |
| `athena`   | Athena         |
| `crown`    | Crown          |
| `sword`    | Sword          |
| `gems`     | Gems           |
| `wild`     | Olympus Wild   |
| `orb`      | Lightning Orb  |

Loading lives in `src/managers/AssetManager.ts` (`loadSymbols`); it HEAD-checks
each path so missing files produce no console errors. Swap it for a Spine/atlas
loader later without touching the reel engine.
