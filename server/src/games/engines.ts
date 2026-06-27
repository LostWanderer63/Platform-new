// Pure, deterministic game logic. Given a uniform float in [0,1) and the
// player's params, return win/multiplier/outcome. No I/O — fully unit-testable
// and re-runnable for provably-fair verification.

export type PlayableGame = "DICE" | "CRASH" | "COINFLIP";

const HOUSE_EDGE = 0.01; // 1%

export interface SettleResult {
  win: boolean;
  multiplier: number; // payout multiplier (0 if lost)
  outcome: Record<string, unknown>;
}

/** DICE — roll 0.00–99.99, bet under/over a target. */
function dice(float: number, params: { target: number; direction: "under" | "over" }): SettleResult {
  const roll = Math.floor(float * 10000) / 100; // 0.00 .. 99.99
  const target = params.target;
  const under = params.direction === "under";
  const winChance = under ? target : 100 - target; // percent
  const win = under ? roll < target : roll > target;
  const multiplier = win ? round2(((100 - HOUSE_EDGE * 100) / winChance)) : 0;
  return { win, multiplier, outcome: { roll, target, direction: params.direction, winChance } };
}

/** CRASH (instant / limbo style) — auto-cashout at `target`; win if the round
 *  reaches it. crashPoint derived uniformly with house edge. */
function crash(float: number, params: { target: number }): SettleResult {
  // float uniform -> heavy-tailed crash point
  let crashPoint = (1 - HOUSE_EDGE) / (1 - Math.min(float, 0.9999999));
  crashPoint = Math.max(1, Math.floor(crashPoint * 100) / 100);
  const win = crashPoint >= params.target;
  const multiplier = win ? round2(params.target) : 0;
  return { win, multiplier, outcome: { crashPoint, target: params.target } };
}

/** COINFLIP — pick heads/tails. */
function coinflip(float: number, params: { side: "heads" | "tails" }): SettleResult {
  const result = float < 0.5 ? "heads" : "tails";
  const win = result === params.side;
  const multiplier = win ? round2(2 * (1 - HOUSE_EDGE)) : 0; // 1.98x
  return { win, multiplier, outcome: { result, side: params.side } };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function settle(
  game: PlayableGame,
  float: number,
  params: Record<string, unknown>,
): SettleResult {
  switch (game) {
    case "DICE":
      return dice(float, params as { target: number; direction: "under" | "over" });
    case "CRASH":
      return crash(float, params as { target: number });
    case "COINFLIP":
      return coinflip(float, params as { side: "heads" | "tails" });
  }
}
