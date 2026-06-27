/**
 * PaylineManager
 * --------------
 * Owns the active payline set. A payline is just `number[]` — one ROW index per
 * REEL (length === reelCount) — so the data is trivially serialisable, editable
 * and future-proof (load from server / config without code changes).
 *
 * Win evaluation always reads left→right starting at reel 0, matching the
 * standard "ways from the left" rule. Lines are validated on construction so a
 * malformed config fails loudly instead of producing silent mis-pays.
 */
export type Payline = readonly number[];

/**
 * 25 curated lines for a 5x4 board (rows 0..3). A mix of horizontals,
 * diagonals, V / inverted-V and zig-zags so wins land across the whole window.
 */
const PAYLINES_5x4: readonly Payline[] = [
    // 4 straight horizontals
    [0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
    [2, 2, 2, 2, 2],
    [3, 3, 3, 3, 3],
    // diagonals
    [0, 1, 2, 3, 3],
    [3, 2, 1, 0, 0],
    [0, 1, 2, 3, 2],
    [3, 2, 1, 0, 1],
    // V / inverted-V
    [0, 1, 2, 1, 0],
    [3, 2, 1, 2, 3],
    [1, 2, 3, 2, 1],
    [2, 1, 0, 1, 2],
    // small zig-zags (top band)
    [0, 0, 1, 0, 0],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
    [1, 1, 0, 1, 1],
    // small zig-zags (bottom band)
    [3, 3, 2, 3, 3],
    [2, 3, 3, 3, 2],
    [3, 2, 2, 2, 3],
    [2, 2, 3, 2, 2],
    // alternating steps
    [0, 1, 0, 1, 0],
    [1, 2, 1, 2, 1],
    [2, 1, 2, 1, 2],
    [3, 2, 3, 2, 3],
    // wide sweep
    [1, 2, 2, 2, 1],
] as const;

/** 20 standard lines for a 5x3 board (rows 0..2) — the classic Vegas set. */
const PAYLINES_5x3: readonly Payline[] = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0],
    [1, 0, 0, 0, 1], [1, 2, 2, 2, 1],
    [0, 1, 1, 1, 0], [2, 1, 1, 1, 2],
    [1, 0, 1, 2, 1], [1, 2, 1, 0, 1],
    [0, 0, 1, 0, 0], [2, 2, 1, 2, 2],
    [1, 1, 0, 1, 1], [1, 1, 2, 1, 1],
    [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
    [0, 2, 0, 2, 0],
] as const;

/** 8 lines for a classic 3x3 board (rows 0..2). */
const PAYLINES_3x3: readonly Payline[] = [
    [1, 1, 1], [0, 0, 0], [2, 2, 2],
    [0, 1, 2], [2, 1, 0],
    [0, 1, 1], [2, 1, 1], [1, 0, 1],
] as const;

export class PaylineManager {
    private readonly reelCount: number;
    private readonly rowCount: number;
    private readonly _lines: Payline[];

    constructor(reelCount: number, rowCount: number, lines?: readonly Payline[]) {
        this.reelCount = reelCount;
        this.rowCount = rowCount;
        const source = lines ?? PaylineManager.defaultLines(reelCount, rowCount);
        this._lines = source.map((line, i) => this.validate(line, i));
    }

    public get lines(): readonly Payline[] {
        return this._lines;
    }

    public get count(): number {
        return this._lines.length;
    }

    public get(index: number): Payline {
        return this._lines[index];
    }

    /** Append a custom line at runtime (feature spins, dynamic ways). */
    public add(line: Payline): number {
        this._lines.push(this.validate(line, this._lines.length));
        return this._lines.length - 1;
    }

    /** Curated set for 5x4 / 5x3; otherwise auto-generate the straight horizontals. */
    private static defaultLines(reelCount: number, rowCount: number): readonly Payline[] {
        if (reelCount === 5 && rowCount === 4) return PAYLINES_5x4;
        if (reelCount === 5 && rowCount === 3) return PAYLINES_5x3;
        if (reelCount === 3 && rowCount === 3) return PAYLINES_3x3;
        const generated: Payline[] = [];
        for (let row = 0; row < rowCount; row++) {
            generated.push(new Array<number>(reelCount).fill(row));
        }
        return generated;
    }

    private validate(line: Payline, index: number): Payline {
        if (line.length !== this.reelCount) {
            throw new Error(`[PaylineManager] line ${index} has ${line.length} stops, expected ${this.reelCount}`);
        }
        for (const row of line) {
            if (row < 0 || row >= this.rowCount) {
                throw new Error(`[PaylineManager] line ${index} references row ${row} outside 0..${this.rowCount - 1}`);
            }
        }
        return line;
    }
}
