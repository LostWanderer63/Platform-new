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

await click(960, 980);             // Bingo Blitz card (slot 21)
await sleep(1600);
await page.screenshot({ path: '/tmp/slotart/bg1-idle.png' });

await click(1758, 676);            // TURBO on (faster draws)
await sleep(200);
await click(1758, 500);            // BUY & PLAY
for (let i = 1; i <= 14; i++) {
    await sleep(1600);
    await page.screenshot({ path: `/tmp/slotart/bg-r${String(i).padStart(2, '0')}.png` });
}
await browser.close();
console.log('ok');
