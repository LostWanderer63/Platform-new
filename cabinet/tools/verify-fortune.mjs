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
await page.screenshot({ path: '/tmp/slotart/fc0-menu.png' });
await click(1268, 977);            // Fortune Coins card (last row, 2nd)
await sleep(1600);
await page.screenshot({ path: '/tmp/slotart/fc1-idle.png' });
for (let i = 1; i <= 6; i++) {
    await click(1775, 540);        // SPIN (ignored while feature runs)
    await sleep(3400);             // reels settle; trigger banner window
    await page.screenshot({ path: `/tmp/slotart/fc${i + 1}-a.png` });
    await sleep(4200);             // respins run / wins present
    await page.screenshot({ path: `/tmp/slotart/fc${i + 1}-b.png` });
    await sleep(4200);             // feature tail / back to idle
    await page.screenshot({ path: `/tmp/slotart/fc${i + 1}-c.png` });
}
await browser.close();
console.log('ok');
