import './style.css';
import { Game } from './core/Game';
import { WalletBridge } from './integration/wallet';

// When embedded in Aurora, hand balance control to the platform wallet.
WalletBridge.init();

const appElement = document.getElementById('app');

if (appElement) {
    const game = new Game();
    game.init(appElement).catch(console.error);
} else {
    console.error('Failed to find app element');
}
