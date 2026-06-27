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
await page.screenshot({ path: '/tmp/slotart/k0-menu.png' });
await click(1268, 954);             // Neon Keno card (row 4, first)
await sleep(1500);
await page.screenshot({ path: '/tmp/slotart/k1-idle.png' });
await click(1696, 248);            // QUICK pick
await sleep(500);
await page.screenshot({ path: '/tmp/slotart/k2-picked.png' });
await click(1758, 890);            // PLAY
await sleep(3000);                 // mid-draw
await page.screenshot({ path: '/tmp/slotart/k3-drawing.png' });
await sleep(4500);                 // settle
await page.screenshot({ path: '/tmp/slotart/k4-result.png' });
await browser.close();
console.log('ok');
