import { createStore } from 'zustand/vanilla';

export interface GameState {
    balance: number;
    bet: number;
    isSpinning: boolean;
    winAmount: number;
    setBalance: (amount: number) => void;
    setBet: (amount: number) => void;
    setSpinning: (isSpinning: boolean) => void;
    setWinAmount: (amount: number) => void;
}

export const gameStore = createStore<GameState>((set) => ({
    balance: 10000, // Starting balance
    bet: 10, // Default bet
    isSpinning: false,
    winAmount: 0,
    setBalance: (amount) => set({ balance: amount }),
    setBet: (amount) => set({ bet: amount }),
    setSpinning: (isSpinning) => set({ isSpinning }),
    setWinAmount: (amount) => set({ winAmount: amount }),
}));
