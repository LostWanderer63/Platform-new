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
await page.screenshot({ path: '/tmp/slotart/b0-menu.png' });
await click(1268, 901);            // Royal Blackjack card (row 3, second)
await sleep(1300);
await page.screenshot({ path: '/tmp/slotart/b1-table.png' });
await click(1758, 490);            // DEAL
await sleep(2000);
await page.screenshot({ path: '/tmp/slotart/b2-dealt.png' });
await click(1758, 734);            // STAND (let dealer play)
await sleep(3500);
await page.screenshot({ path: '/tmp/slotart/b3-result.png' });
await sleep(1000);
await click(1758, 490);            // DEAL again
await sleep(2000);
await click(1758, 612);            // HIT once
await sleep(1200);
await page.screenshot({ path: '/tmp/slotart/b4-hit.png' });
await browser.close();
console.log('ok');
