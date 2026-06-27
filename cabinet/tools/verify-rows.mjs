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
await click(960, 762);   // plinko card
await sleep(1500);
await click(145, 638);   // ROWS = 16
await sleep(600);
for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await sleep(300); }
await sleep(1600);
await page.screenshot({ path: '/tmp/slotart/r16-flight.png' });
await sleep(7000);       // slower balls — let them all land
await click(145, 390);   // ROWS = 8
await sleep(600);
await page.keyboard.press('Space');
await sleep(1500);
await page.screenshot({ path: '/tmp/slotart/r8.png' });
await browser.close();
console.log('ok');
