import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--window-size=1920,1080', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(process.env.GAME_URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30000 });
await sleep(3500);
const box = await (await page.$('canvas')).boundingBox();
const click = async (lx, ly) => page.mouse.click(box.x + (lx / 1920) * box.width, box.y + (ly / 1080) * box.height);

await click(1416, 980);            // Royal Baccarat card (slot 23)
await sleep(1600);
await page.screenshot({ path: '/tmp/slotart/bc1-idle.png' });

const round = async (label) => {
    await click(350, 795);         // PLAYER
    await click(1210, 795);        // BANKER
    await click(780, 795);         // TIE
    await click(230, 663);         // P PAIR
    await click(1330, 663);        // B PAIR
    await sleep(400);
    await page.screenshot({ path: `/tmp/slotart/bc-${label}-bets.png` });
    await click(1758, 420);        // DEAL
    await sleep(2600);
    await page.screenshot({ path: `/tmp/slotart/bc-${label}-deal.png` });
    await sleep(2200);             // third cards + settle
    await page.screenshot({ path: `/tmp/slotart/bc-${label}-settle.png` });
    await sleep(900);
};
await round('r1');
await round('r2');
await round('r3');
// HOW TO PLAY overlay.
await click(1536, 150);            // ? help button
await sleep(500);
await page.screenshot({ path: '/tmp/slotart/bc-help.png' });
await browser.close();
console.log('ok');
