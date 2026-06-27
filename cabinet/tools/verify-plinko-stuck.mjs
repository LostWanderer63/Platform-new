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
await click(960, 762);                  // plinko card
await sleep(1500);
for (let i = 0; i < 8; i++) { await page.keyboard.press('Space'); await sleep(160); } // full cap
await sleep(2500);
await page.screenshot({ path: '/tmp/slotart/p1-burst.png' });
await sleep(11000);                     // all balls must land well before 15s cap
await page.screenshot({ path: '/tmp/slotart/p2-settled.png' });
await click(145, 638);                  // ROWS 16 — must work now (no stuck balls)
await sleep(700);
for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await sleep(250); }
await sleep(1800);
await page.screenshot({ path: '/tmp/slotart/p3-rows16.png' });
await browser.close();
console.log('ok');
