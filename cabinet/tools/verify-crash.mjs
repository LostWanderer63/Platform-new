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
const click = async (lx, ly) => page.mouse.click(box.x + (lx/1920)*box.width, box.y + (ly/1080)*box.height);
await click(1584, 762);            // slot 6 card
await sleep(800);
await page.screenshot({ path: '/tmp/slotart/a1-waiting.png' });
await click(1110, 987);            // BET button (panel right)
await sleep(3400);                 // rest of countdown
await sleep(2000);                 // ~2s into flight
await page.screenshot({ path: '/tmp/slotart/a2-flying.png' });
await sleep(2800);                 // ~5s into flight if alive
await page.screenshot({ path: '/tmp/slotart/a3-flying2.png' });
await page.keyboard.press('Space');
await sleep(500);
await page.screenshot({ path: '/tmp/slotart/a4-banked.png' });
await sleep(16000);                // rounds cycle, history fills
await page.screenshot({ path: '/tmp/slotart/a5-later.png' });
await browser.close();
console.log('ok');
