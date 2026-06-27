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
await click(1576, 977);            // Sugar Storm card (last row, 3rd)
await sleep(2600);                 // initial board drop
await page.screenshot({ path: '/tmp/slotart/ss1-idle.png' });
for (let i = 1; i <= 3; i++) {
    await click(1758, 420);        // SPIN
    await sleep(1500);
    await page.screenshot({ path: `/tmp/slotart/ss2-spin${i}-mid.png` });
    await sleep(4500);
    await page.screenshot({ path: `/tmp/slotart/ss2-spin${i}-end.png` });
    await sleep(1500);
}
await click(1758, 816);            // TURBO on (faster bonus)
await sleep(300);
await click(1758, 644);            // BUY FEATURE
for (let i = 1; i <= 12; i++) {
    await sleep(4000);
    await page.screenshot({ path: `/tmp/slotart/ss3-bonus${String(i).padStart(2, '0')}.png` });
}
await browser.close();
console.log('ok');
