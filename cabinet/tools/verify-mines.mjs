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
await page.screenshot({ path: '/tmp/slotart/m0-menu.png' });
await click(960, 901);             // Crystal Mines card (centered last row)
await sleep(1800);
await page.screenshot({ path: '/tmp/slotart/m1-idle.png' });
await click(1250, 996);            // START
await sleep(600);
for (const [x, y] of [[656,219],[960,371],[1264,523],[808,675]]) { await click(x, y); await sleep(700); }
await page.screenshot({ path: '/tmp/slotart/m2-picks.png' });
await page.keyboard.press('Space'); // cash out (if not busted)
await sleep(900);
await page.screenshot({ path: '/tmp/slotart/m3-result.png' });
await sleep(2200);
await page.screenshot({ path: '/tmp/slotart/m4-reset.png' });
await browser.close();
console.log('ok');
