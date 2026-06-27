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
await click(960, 992);             // Turbo Derby card (last row, centred)
await sleep(1600);
await page.screenshot({ path: '/tmp/slotart/td1-idle.png' });
await click(175, 482);             // back runner 2 (chip on lane 2)
await sleep(400);
await page.screenshot({ path: '/tmp/slotart/td2-picked.png' });
for (let i = 1; i <= 3; i++) {
    await click(1758, 460);        // START
    await sleep(2600);
    await page.screenshot({ path: `/tmp/slotart/td3-race${i}-mid.png` });
    await sleep(4200);             // finish + photo finish + result
    await page.screenshot({ path: `/tmp/slotart/td3-race${i}-end.png` });
    await sleep(1400);             // walk back for next race
}
await browser.close();
console.log('ok');
