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
await page.screenshot({ path: '/tmp/slotart/vp0-menu.png' });
await click(960, 977);             // Jacks or Better card (centred last row)
await sleep(1400);
await page.screenshot({ path: '/tmp/slotart/vp1-idle.png' });
await click(1758, 446);            // DEAL
await sleep(1600);
await page.screenshot({ path: '/tmp/slotart/vp2-dealt.png' });
await click(610, 700);             // hold card 2
await click(1050, 700);            // hold card 4
await sleep(400);
await page.screenshot({ path: '/tmp/slotart/vp3-held.png' });
await click(1758, 446);            // DRAW
await sleep(2400);
await page.screenshot({ path: '/tmp/slotart/vp4-result.png' });
await click(1758, 446);            // deal again
await sleep(1600);
await page.screenshot({ path: '/tmp/slotart/vp5-second.png' });
await browser.close();
console.log('ok');
