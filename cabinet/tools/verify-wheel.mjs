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
await page.screenshot({ path: '/tmp/slotart/w0-menu.png' });
await click(1268, 901);            // Golden Wheel card
await sleep(1400);
await page.screenshot({ path: '/tmp/slotart/w1-idle.png' });
await click(1585, 434);            // pick 5x
await sleep(300);
await click(1585, 866);            // SPIN
await sleep(2200);
await page.screenshot({ path: '/tmp/slotart/w2-spinning.png' });
await sleep(5400);                 // settle + result
await page.screenshot({ path: '/tmp/slotart/w3-result.png' });
await sleep(1500);
await click(1585, 866);            // spin again
await sleep(7600);
await page.screenshot({ path: '/tmp/slotart/w4-second.png' });
await browser.close();
console.log('ok');
