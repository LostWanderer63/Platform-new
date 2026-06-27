/**
 * WinCalculator
 * -------------
 * Pure, side-effect-free win evaluation. Given a board, the active paylines and
 * the stake, it returns a structured `WinResult` the presenter can render. No
 * PixiJS, no GSAP — fully unit-testable.
 *
 * Rules implemented:
 *  - Left→right matching from reel 0 (a line pays only if it starts on reel 0).
 *  - Wild substitution: wilds stand in for any normal symbol; the line symbol
 *    is the first non-wild on the line (all-wild lines pay as the wild itself).
 *  - Multipliers: wilds participating in a win multiply the line (configurable).
 *  - Scatters: pay anywhere on the board once `scatterMin` land, independent of
 *    paylines, and are reported separately (bonus/anticipation trigger).
 */
import type { SymbolModel } from './SymbolRegistry';
import type { PaylineManager } from './PaylineManager';

export interface Cell {
    readonly reel: number;
    readonly row: number;
}

export interface LineWin {
    readonly lineIndex: number;
    readonly symbolId: string;
    readonly count: number;
    /** Multiplier contributed by wilds on this line (1 == none). */
    readonly multiplier: number;
    readonly amount: number;
    readonly cells: Cell[];
}

export interface ScatterWin {
    readonly symbolId: string;
    readonly count: number;
    readonly amount: number;
    readonly cells: Cell[];
}

export interface WinResult {
    readonly totalWin: number;
    readonly lineWins: LineWin[];
    readonly scatter: ScatterWin | null;
    /** Largest line multiplier in the result, for headline presentation. */
    readonly topMultiplier: number;
    readonly bet: number;
}

export interface WinCalculatorOptions {
    /** Each wild in a winning line contributes this factor (multiplicative). */
    readonly wildMultiplier: number;
    /** Minimum scatters on the board to trigger a scatter win. */
    readonly scatterMin: number;
}

const DEFAULT_OPTIONS: WinCalculatorOptions = { wildMultiplier: 2, scatterMin: 3 };

export class WinCalculator {
    private readonly model: SymbolModel;
    private readonly opts: WinCalculatorOptions;

    constructor(model: SymbolModel, options: Partial<WinCalculatorOptions> = {}) {
        this.model = model;
        this.opts = { ...DEFAULT_OPTIONS, ...options };
    }

    /**
     * Evaluate one spin. `board[reel][row]` (top→bottom), as produced by
     * `ReelManager.getBoard()`. `bet` is the total stake; per-line bet is the
     * stake divided across the active lines.
     */
    public evaluate(board: string[][], paylines: PaylineManager, bet: number): WinResult {
        const lineBet = bet / paylines.count;
        const lineWins: LineWin[] = [];
        let total = 0;
        let topMultiplier = 1;

        for (let i = 0; i < paylines.count; i++) {
            const win = this.evaluateLine(board, paylines.get(i), i, lineBet);
            if (win) {
                lineWins.push(win);
                total += win.amount;
                if (win.multiplier > topMultiplier) topMultiplier = win.multiplier;
            }
        }

        const scatter = this.evaluateScatter(board, bet);
        if (scatter) total += scatter.amount;

        return { totalWin: total, lineWins, scatter, topMultiplier, bet };
    }

    // ----------------------------------------------------------------------

    private evaluateLine(
        board: string[][],
        line: readonly number[],
        lineIndex: number,
        lineBet: number,
    ): LineWin | null {
        // Read the symbols sitting on this line, left→right.
        const ids: string[] = [];
        for (let reel = 0; reel < line.length; reel++) ids.push(board[reel][line[reel]]);

        // The paying symbol is the first non-wild, non-scatter on the line.
        let lineSymbol: string | null = null;
        for (const id of ids) {
            if (this.model.isScatter(id)) break; // scatter breaks line continuity
            if (!this.model.isWild(id)) {
                lineSymbol = id;
                break;
            }
        }
        // All-wild run pays as the wild symbol itself.
        const payingSymbol = lineSymbol ?? (this.model.isWild(ids[0]) ? ids[0] : null);
        if (!payingSymbol) return null;

        // Count the consecutive matching run from reel 0 (wilds substitute).
        let count = 0;
        let wilds = 0;
        const cells: Cell[] = [];
        for (let reel = 0; reel < ids.length; reel++) {
            const id = ids[reel];
            const isWild = this.model.isWild(id);
            if (id === payingSymbol || isWild) {
                count++;
                if (isWild) wilds++;
                cells.push({ reel, row: line[reel] });
            } else {
                break;
            }
        }

        const base = this.model.payout(payingSymbol, count);
        if (base <= 0) return null;

        const multiplier = wilds > 0 ? Math.pow(this.opts.wildMultiplier, wilds) : 1;
        const amount = base * lineBet * multiplier;

        return { lineIndex, symbolId: payingSymbol, count, multiplier, amount, cells };
    }

    private evaluateScatter(board: string[][], bet: number): ScatterWin | null {
        const scatterId = this.model.scatterId();
        const cells: Cell[] = [];
        for (let reel = 0; reel < board.length; reel++) {
            const column = board[reel];
            for (let row = 0; row < column.length; row++) {
                if (column[row] === scatterId) cells.push({ reel, row });
            }
        }
        if (cells.length < this.opts.scatterMin) return null;

        // Scatters pay on the TOTAL bet, not per line.
        const amount = this.model.payout(scatterId, cells.length) * bet;
        return { symbolId: scatterId, count: cells.length, amount, cells };
    }
}
