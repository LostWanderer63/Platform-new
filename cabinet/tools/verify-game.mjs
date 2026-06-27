/**
 * verify-game.mjs — drive the running dev server with system Chrome and
 * screenshot: menu → slot 4 (spin) → plinko (drops). Output in /tmp/slotart/.
 */
import puppeteer from 'puppeteer-core';

const URL = process.env.GAME_URL ?? 'http://localhost:5173/';
const OUT = '/tmp/slotart';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--window-size=1920,1080', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(2500);
await page.screenshot({ path: `${OUT}/01-menu.png` });

// Map logical 1920×1080 coords → page coords through the scaled canvas.
const canvasBox = await (await page.$('canvas')).boundingBox();
const at = (lx, ly) => [canvasBox.x + (lx / 1920) * canvasBox.width, canvasBox.y + (ly / 1080) * canvasBox.height];
const click = async (lx, ly) => { const [x, y] = at(lx, ly); await page.mouse.click(x, y); };

// 3×2 grid: cardW 580 gap 44 → startX 46; rows at y 343/637; centres row1 y=468, row2 y=762.
await click(336, 762);            // slot 4 (row 2, col 1)
await sleep(1800);
await page.screenshot({ path: `${OUT}/02-slot4.png` });

await page.keyboard.press('Space');
await sleep(1450);                // anticipation window on final reels
await page.screenshot({ path: `${OUT}/03-slot4-anticipation.png` });
await sleep(3200);
await page.screenshot({ path: `${OUT}/04-slot4-landed.png` });

await page.keyboard.press('Escape');
await sleep(900);
await click(960, 762);            // slot 5 plinko (row 2, col 2)
await sleep(1500);
for (let i = 0; i < 5; i++) { await page.keyboard.press('Space'); await sleep(260); }
await page.screenshot({ path: `${OUT}/05-plinko-flight.png` });
await sleep(2600);
await page.screenshot({ path: `${OUT}/06-plinko-landed.png` });

await browser.close();
console.log('screenshots written to', OUT);
