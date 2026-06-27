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
await page.screenshot({ path: '/tmp/slotart/t0-menu.png' });
await click(1576, 901);            // Dragon Tower card (row 3, col 3)
await sleep(1300);
await page.screenshot({ path: '/tmp/slotart/t1-idle.png' });
await click(1758, 620);            // START
await sleep(700);
await page.screenshot({ path: '/tmp/slotart/t2-row0.png' });
for (const [x, y] of [[546, 880], [720, 802], [894, 724], [546, 646]]) {
    await click(x, y);
    await sleep(700);
}
await page.screenshot({ path: '/tmp/slotart/t3-climb.png' });
await page.keyboard.press('Space'); // cash out if still alive
await sleep(900);
await page.screenshot({ path: '/tmp/slotart/t4-result.png' });
await sleep(2200);
await page.screenshot({ path: '/tmp/slotart/t5-reset.png' });
await browser.close();
console.log('ok');
