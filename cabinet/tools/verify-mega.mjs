import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--window-size=1920,1080', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, '\n', (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto(process.env.GAME_URL, { waitUntil: 'domcontentloaded' });
await sleep(4000);
const box = await (await page.$('canvas')).boundingBox();
const click = async (lx, ly) => page.mouse.click(box.x + (lx / 1920) * box.width, box.y + (ly / 1080) * box.height);
const move = async (lx, ly) => page.mouse.move(box.x + (lx / 1920) * box.width, box.y + (ly / 1080) * box.height);

// Menu redesign screenshot + hover.
await page.screenshot({ path: '/tmp/slotart/menu-new.png' });
await move(300, 300);              // hover a card
await sleep(300);
await page.screenshot({ path: '/tmp/slotart/menu-hover.png' });

// Open Royal Megaways (slot 20 — last cell of a 4-col, 5-row grid).
// Grid: 4 cols, cards centred; slot 20 is i=19 (row4, col3).
await click(1645, 963);
await sleep(1600);
await page.screenshot({ path: '/tmp/slotart/mw1-idle.png' });

// Turbo on, then several spins.
await click(1758, 596);           // TURBO
await sleep(200);
for (let i = 1; i <= 8; i++) {
    await click(1758, 420);       // SPIN
    await sleep(1400);
    await page.screenshot({ path: `/tmp/slotart/mw-spin${i}-a.png` });
    await sleep(3200);            // cascades + possible bonus
    await page.screenshot({ path: `/tmp/slotart/mw-spin${i}-b.png` });
}
await browser.close();
console.log('ok');
