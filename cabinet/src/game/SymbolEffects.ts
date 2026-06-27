/**
 * SymbolEffects
 * -------------
 * Reusable, pooled visual flourishes that sit on the reel container's
 * `overlayLayer`: soft halos behind winning symbols, expanding energy rings,
 * and particle/coin bursts.
 *
 * Everything is POOLED — glows, rings and particles are allocated once and
 * recycled, so a win never triggers a GC spike on mobile. `clearAll()` parks
 * every object back in its pool and kills its tweens.
 *
 * Extension point for "future coin explosions and particles": `coinBurst`
 * already drives a pooled particle system; swap the pooled Graphics for textured
 * sprites / an emitter when art is ready.
 */
import { Container, Graphics, BlurFilter } from 'pixi.js';
import { gsap } from 'gsap';

interface Pooled {
    gfx: Graphics;
    active: boolean;
}

export class SymbolEffects {
    private readonly layer: Container;
    private readonly cellWidth: number;
    private readonly cellHeight: number;

    private readonly glows: Pooled[] = [];
    private readonly rings: Pooled[] = [];
    private readonly flashes: Pooled[] = [];
    private readonly particles: Pooled[] = [];
    private readonly softBlur: BlurFilter;

    constructor(layer: Container, cellWidth: number, cellHeight: number) {
        this.layer = layer;
        this.cellWidth = cellWidth;
        this.cellHeight = cellHeight;
        // One shared blur softens every glow without per-object cost duplication.
        this.softBlur = new BlurFilter({ strength: 12, quality: 3 });
    }

    /**
     * Soft additive HALO around a cell — a blurred glowing frame plus a faint
     * inner bloom. The centre stays clear so the symbol art reads.
     */
    public showGlow(x: number, y: number, color: number, delay = 0): void {
        const glow = this.acquire(this.glows, true);
        const g = glow.gfx;
        const w = this.cellWidth;
        const h = this.cellHeight;

        g.clear()
            .roundRect(-w * 0.46, -h * 0.46, w * 0.92, h * 0.92, 22)
            .fill({ color, alpha: 0.12 })
            .roundRect(-w * 0.49, -h * 0.49, w * 0.98, h * 0.98, 24)
            .stroke({ width: 8, color, alpha: 0.95 });
        g.position.set(x, y);
        g.alpha = 0;
        g.scale.set(0.7);
        g.visible = true;

        gsap.killTweensOf(g);
        gsap.killTweensOf(g.scale);
        gsap.to(g.scale, { x: 1, y: 1, duration: 0.32, ease: 'back.out(2)', delay });
        gsap.timeline({ delay })
            .to(g, { alpha: 0.9, duration: 0.25, ease: 'power2.out' })
            .to(g, { alpha: 0.62, duration: 0.8, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    }

    /**
     * Expanding energy ring radiating from a cell — the premium "this paid"
     * pulse. Loops continuously while the win is on screen.
     */
    public burstRing(x: number, y: number, color: number, delay = 0): void {
        const ring = this.acquire(this.rings, true);
        const g = ring.gfx;
        const r = Math.max(this.cellWidth, this.cellHeight) * 0.42;

        g.clear().circle(0, 0, r).stroke({ width: 6, color, alpha: 1 });
        g.position.set(x, y);
        g.scale.set(0.5);
        g.alpha = 0;
        g.visible = true;

        gsap.killTweensOf(g);
        gsap.killTweensOf(g.scale);
        gsap.timeline({ repeat: -1, delay, repeatDelay: 0.15 })
            .set(g, { alpha: 0.85 })
            .set(g.scale, { x: 0.5, y: 0.5 }, 0)
            .to(g.scale, { x: 1.9, y: 1.9, duration: 0.85, ease: 'power1.out' }, 0)
            .to(g, { alpha: 0, duration: 0.85, ease: 'power1.out' }, 0);
    }

    /**
     * One-shot flash ring — a single bright ring snaps outward and fades as a
     * tile pops. Fires once (not looping) so it reads as a clean "catch the
     * light" hit rather than busy continuous pulsing.
     */
    public flashRing(x: number, y: number, color: number, delay = 0): void {
        const ring = this.acquire(this.rings, true);
        const g = ring.gfx;
        const r = Math.max(this.cellWidth, this.cellHeight) * 0.5;

        g.clear().circle(0, 0, r).stroke({ width: 8, color, alpha: 1 });
        g.position.set(x, y);
        g.scale.set(0.55);
        g.alpha = 0;
        g.visible = true;

        gsap.killTweensOf(g);
        gsap.killTweensOf(g.scale);
        gsap.timeline({ delay })
            .set(g, { alpha: 0.9 })
            .to(g.scale, { x: 1.35, y: 1.35, duration: 0.45, ease: 'power2.out' }, 0)
            .to(g, { alpha: 0, duration: 0.45, ease: 'power2.out' }, 0)
            .add(() => { g.visible = false; ring.active = false; });
    }

    /**
     * Bright one-shot glint over a tile as it pops — a quick white bloom that
     * reads as the metal frame catching the light.
     */
    public tileFlash(x: number, y: number, w: number, h: number, delay = 0): void {
        const f = this.acquire(this.flashes, false);
        const g = f.gfx;
        g.clear().roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.16).fill({ color: 0xffffff });
        g.position.set(x, y);
        g.alpha = 0;
        g.visible = true;

        gsap.killTweensOf(g);
        gsap.timeline({ delay })
            .to(g, { alpha: 0.5, duration: 0.12, ease: 'power2.out' })
            .to(g, { alpha: 0, duration: 0.3, ease: 'power2.in' })
            .add(() => { g.visible = false; f.active = false; });
    }

    /**
     * Pooled particle burst (the coin-explosion hook). Emits `count` particles
     * outward with gravity, then recycles them.
     */
    public coinBurst(x: number, y: number, color = 0xffd54f, count = 14): void {
        for (let i = 0; i < count; i++) {
            const p = this.acquire(this.particles, false);
            const g = p.gfx;
            const size = 6 + Math.random() * 8;
            g.clear().circle(0, 0, size).fill({ color });
            g.position.set(x, y);
            g.alpha = 1;
            g.visible = true;

            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
            const speed = 120 + Math.random() * 160;
            const dx = Math.cos(angle) * speed;
            const dy = Math.sin(angle) * speed - 120;

            gsap.killTweensOf(g);
            gsap.to(g, {
                x: x + dx,
                y: y + dy + 260,
                alpha: 0,
                duration: 0.7 + Math.random() * 0.3,
                ease: 'power2.out',
                onComplete: () => { g.visible = false; p.active = false; },
            });
        }
    }

    /** Park every effect and stop its tweens. */
    public clearAll(): void {
        for (const pool of [this.glows, this.rings, this.flashes, this.particles]) {
            for (const o of pool) {
                gsap.killTweensOf(o.gfx);
                gsap.killTweensOf(o.gfx.scale);
                o.gfx.visible = false;
                o.gfx.alpha = 1;
                o.gfx.scale.set(1);
                o.active = false;
            }
        }
    }

    // ----------------------------------------------------------------------

    /** Acquire a pooled Graphics. `behind` inserts beneath lifted tiles. */
    private acquire(pool: Pooled[], behind: boolean): Pooled {
        let obj = pool.find((o) => !o.active);
        if (!obj) {
            const gfx = new Graphics();
            gfx.blendMode = 'add';
            if (pool === this.glows) gfx.filters = [this.softBlur];
            gfx.visible = false;
            if (behind) this.layer.addChildAt(gfx, 0);
            else this.layer.addChild(gfx);
            obj = { gfx, active: false };
            pool.push(obj);
        }
        obj.active = true;
        return obj;
    }
}
