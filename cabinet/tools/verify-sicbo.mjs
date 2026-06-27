import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--window-size=1920,1080', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(process.env.GAME_URL, { waitUntil: 'networkidle0' });
await sleep(2500);
const box = await (await page.$('canvas')).boundingBox();
const click = async (lx, ly) => page.mouse.click(box.x + (lx / 1920) * box.width, box.y + (ly / 1080) * box.height);

await click(960, 1002);            // Dragon Sic Bo card (slot 19)
await sleep(1600);
await page.screenshot({ path: '/tmp/slotart/sb1-idle.png' });

const round = async (label) => {
    // Spread chips across many zone types.
    await click(420, 408);         // SMALL
    await click(420, 408);
    await click(1140, 408);        // BIG
    await click(619, 734);         // single-4
    await click(461, 734);         // single-3
    await click(1418, 544);        // total-10
    await click(220, 868);         // ANY TRIPLE
    await click(635, 868);         // triple-2
    await sleep(400);
    await page.screenshot({ path: `/tmp/slotart/sb-${label}-bets.png` });
    await click(1758, 420);        // SHAKE
    await sleep(900);
    await page.screenshot({ path: `/tmp/slotart/sb-${label}-rolling.png` });
    await sleep(2400);             // settle + highlights + banner
    await page.screenshot({ path: `/tmp/slotart/sb-${label}-settle.png` });
    await sleep(900);              // board auto-clears
};
await round('r1');
await round('r2');

// REBET path.
await click(1758, 540);            // REBET (replays last stake)
await sleep(400);
await page.screenshot({ path: '/tmp/slotart/sb-rebet.png' });
await click(1758, 420);            // SHAKE
await sleep(3400);
await page.screenshot({ path: '/tmp/slotart/sb-rebet-settle.png' });
await browser.close();
console.log('ok');
