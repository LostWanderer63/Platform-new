/**
 * SymbolAnimator
 * --------------
 * GSAP-driven motion for individual symbols. Stateless and reusable: it only
 * tweens existing `ReelSymbol` containers (no allocation of display objects),
 * and every routine is keyed off the registry's `AnimationHook` so the win
 * system stays decoupled from concrete animations.
 *
 * Premium feel comes from layering: a one-shot elastic "pop" to grab the eye,
 * then a looping pulse/glow that holds while the win is presented. `reset`
 * kills all tweens and restores the neutral pose so symbols are clean for the
 * next spin.
 */
import { gsap } from 'gsap';
import type { ReelSymbol } from '../reels/Symbol';
import type { AnimationHook } from './SymbolRegistry';

export class SymbolAnimator {
    /**
     * Premium win highlight used for lifted tiles: a squash-stretch pop that
     * settles into a heartbeat pulse plus a subtle wobble. `delay` staggers the
     * pops so winners reveal in sequence rather than all at once. The `hook`
     * adds per-symbol flavour (wild shimmer, scatter wobble) on top.
     */
    public winHighlight(symbol: ReelSymbol, _hook: AnimationHook, delay = 0): void {
        gsap.killTweensOf(symbol);
        gsap.killTweensOf(symbol.scale);
        symbol.rotation = 0;

        // Clean uniform pop, then a gentle breathing pulse. No squash, no wobble.
        // Pop is capped so the padded art (SYMBOL_FILL) never touches neighbours.
        gsap.timeline({ delay })
            // smooth pop with a gentle overshoot, settle, then quiet breathing
            .fromTo(
                symbol.scale,
                { x: 1, y: 1 },
                { x: 1.12, y: 1.12, duration: 0.28, ease: 'back.out(2)' },
            )
            .to(symbol.scale, { x: 1.04, y: 1.04, duration: 0.22, ease: 'power2.inOut' })
            .to(symbol.scale, {
                x: 1.09,
                y: 1.09,
                duration: 0.85,
                ease: 'sine.inOut',
                yoyo: true,
                repeat: -1,
            });
    }

    /** Dispatch the registry-named hook for a winning symbol. */
    public play(hook: AnimationHook, symbol: ReelSymbol): void {
        switch (hook) {
            case 'bounce': this.bounce(symbol); break;
            case 'pulse': this.pulse(symbol); break;
            case 'glow': this.glow(symbol); break;
            case 'anticipate': this.anticipate(symbol); break;
        }
    }

    /**
     * Snappy back-ease pop followed by a sustained pulse — default highlight.
     * Tiles are lifted onto an unmasked layer before this runs, so the pop can
     * grow past the cell without clipping.
     */
    public bounce(symbol: ReelSymbol): void {
        gsap.killTweensOf(symbol.scale);
        const tl = gsap.timeline();
        tl.fromTo(
            symbol.scale,
            { x: 1, y: 1 },
            { x: 1.32, y: 1.32, duration: 0.34, ease: 'back.out(3.2)' },
        ).to(symbol.scale, {
            x: 1.16,
            y: 1.16,
            duration: 0.55,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
        });
    }

    /** Gentle breathing pulse for low/mid symbols. */
    public pulse(symbol: ReelSymbol): void {
        gsap.killTweensOf(symbol.scale);
        gsap.to(symbol.scale, {
            x: 1.12,
            y: 1.12,
            duration: 0.5,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
        });
    }

    /** Shimmering alpha + soft scale — used for the wild. */
    public glow(symbol: ReelSymbol): void {
        gsap.killTweensOf(symbol);
        gsap.killTweensOf(symbol.scale);
        gsap.to(symbol, { alpha: 0.7, duration: 0.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        gsap.to(symbol.scale, { x: 1.15, y: 1.15, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    }

    /**
     * Anticipation: a slow, heavy pulse with a slight wobble — fired on scatter
     * symbols while the final reels are still spinning to build tension.
     */
    public anticipate(symbol: ReelSymbol): void {
        gsap.killTweensOf(symbol.scale);
        gsap.killTweensOf(symbol);
        gsap.to(symbol.scale, { x: 1.3, y: 1.3, duration: 0.7, ease: 'power1.inOut', yoyo: true, repeat: -1 });
        gsap.fromTo(
            symbol,
            { rotation: -0.04 },
            { rotation: 0.04, duration: 0.18, ease: 'sine.inOut', yoyo: true, repeat: -1 },
        );
    }

    /** Stop everything and restore the neutral resting pose. */
    public reset(symbol: ReelSymbol): void {
        gsap.killTweensOf(symbol);
        gsap.killTweensOf(symbol.scale);
        symbol.rotation = 0;
        symbol.reset(); // scale → 1, alpha → 1
    }
}
