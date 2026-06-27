import { gameStore } from '../state/GameState';
import { SLOTS } from '../scenes/MenuScene';

/**
 * Aurora wallet bridge (mirror mode).
 *
 * Embedded in Aurora (inside an <iframe>), the game keeps running its own
 * outcome, and we MIRROR every balance change into the platform wallet so the
 * Aurora balance always equals what the player sees on the reels.
 *
 *   host -> game : { type: 'aurora:balance', balance }   // starting balance (handshake)
 *   game -> host : { type: 'aurora:ready', game }         // ask for the starting balance
 *   game -> host : { type: 'aurora:bet', amount, game }   // stake deducted locally
 *   game -> host : { type: 'aurora:win', amount, game }   // payout credited locally
 *
 * The host records each bet/win against the real wallet ledger (overdraft-blocked)
 * and updates the platform balance. We do NOT echo per-round balances back — the
 * game owns its own on-screen number, which started from the real balance.
 *
 * Standalone (not embedded) leaves the local 10,000-credit play-money store alone.
 */

let embedded = false;
let applyingFromServer = false;
let started = false;

function currentGameTitle(): string {
  const raw = new URLSearchParams(window.location.search).get('game');
  const n = raw === null ? NaN : parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 && n < SLOTS.length ? SLOTS[n].title : 'Wrath of Olympus';
}

function post(msg: Record<string, unknown>): void {
  window.parent.postMessage(msg, '*');
}

function setBalanceFromServer(balance: number): void {
  applyingFromServer = true;
  gameStore.getState().setBalance(balance);
  applyingFromServer = false;
}

export const WalletBridge = {
  init(): void {
    embedded = window.parent !== window;
    if (!embedded) return;

    const game = currentGameTitle();

    // hold at 0 until the platform sends the real starting balance
    setBalanceFromServer(0);

    window.addEventListener('message', (e: MessageEvent) => {
      const d = e.data as { type?: string; balance?: number };
      if (!d || typeof d !== 'object') return;
      if (d.type === 'aurora:balance' && typeof d.balance === 'number') {
        setBalanceFromServer(d.balance);
        started = true; // bets/wins from here on are mirrored to the platform
      }
    });

    gameStore.subscribe((s, p) => {
      if (applyingFromServer || !started) return;
      const delta = s.balance - p.balance;
      if (delta < 0) post({ type: 'aurora:bet', amount: -delta, game });
      else if (delta > 0) post({ type: 'aurora:win', amount: delta, game });
    });

    post({ type: 'aurora:ready', game });
  },
};
