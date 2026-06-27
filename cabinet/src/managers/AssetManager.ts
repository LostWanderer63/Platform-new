import { Assets, Texture } from 'pixi.js';

export class AssetManager {
    /** Symbol id → real texture, populated by `preload()` (procedural fallback otherwise). */
    public static readonly preloadedSymbols = new Map<string, Texture>();
    /** Background image, populated by `preload()` (procedural temple otherwise). */
    public static background: Texture | null = null;

    public static async init(): Promise<void> {
        // Initialize PIXI Assets here if needed
        await Assets.init();
    }

    /**
     * Preload every optional art file (symbols + background) up-front so the game
     * shows with no pop-in. Reports 0..1 progress for the loading bar. Missing
     * files are skipped (procedural fallback), so this is safe with no art at all.
     */
    public static async preload(symbolIds: readonly string[], onProgress?: (p: number) => void): Promise<void> {
        const base = import.meta.env.BASE_URL ?? '/';
        const total = symbolIds.length + 1;
        let done = 0;
        const tick = (): void => { done++; onProgress?.(done / total); };

        const tasks: Promise<void>[] = symbolIds.map(async (id) => {
            const url = `${base}symbols/${id}.png`;
            if (await AssetManager.exists(url)) {
                try {
                    const texture = await Assets.load<Texture>(url);
                    if (texture) AssetManager.preloadedSymbols.set(id, texture);
                } catch { /* fallback */ }
            }
            tick();
        });

        tasks.push((async () => {
            AssetManager.background = await AssetManager.loadFirstTexture([
                `${base}background.png`, `${base}background.jpg`, `${base}bg.png`, `${base}bg.jpg`,
            ]);
            tick();
        })());

        await Promise.all(tasks);
    }

    public static async loadBundle(_bundleName: string): Promise<void> {
        // Placeholder for loading a bundle
        // Example: await Assets.loadBundle(bundleName);
    }

    /**
     * Try to load real symbol art from `public/symbols/<id>.png`. Any id whose
     * file is missing is silently skipped — the reel engine falls back to the
     * procedural tile for it. Drop a PNG (or swap for a Spine/atlas loader) and
     * it is picked up automatically, no code change required.
     */
    public static async loadSymbols(ids: readonly string[]): Promise<Map<string, Texture>> {
        const base = import.meta.env.BASE_URL ?? '/';
        const found = new Map<string, Texture>();

        await Promise.all(
            ids.map(async (id) => {
                const url = `${base}symbols/${id}.png`;
                // Skip the network error noise for files that aren't there.
                if (!(await AssetManager.exists(url))) return;
                try {
                    const texture = await Assets.load<Texture>(url);
                    if (texture) found.set(id, texture);
                } catch {
                    /* missing/invalid → procedural fallback */
                }
            }),
        );

        return found;
    }

    /** Load the first of `urls` that exists (e.g. background.png → .jpg). */
    public static async loadFirstTexture(urls: readonly string[]): Promise<Texture | null> {
        for (const url of urls) {
            if (!(await AssetManager.exists(url))) continue;
            try {
                const texture = await Assets.load<Texture>(url);
                if (texture) return texture;
            } catch {
                /* try next */
            }
        }
        return null;
    }

    private static async exists(url: string): Promise<boolean> {
        try {
            const res = await fetch(url, { method: 'HEAD' });
            return res.ok;
        } catch {
            return false;
        }
    }
}
