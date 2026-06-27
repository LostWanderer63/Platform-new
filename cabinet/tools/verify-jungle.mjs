import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--window-size=1920,1080', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(process.env.GAME_URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30000 });
await sleep(3500);
const box = await (await page.$('canvas')).boundingBox();
const click = async (lx, ly) => page.mouse.click(box.x + (lx / 1920) * box.width, box.y + (ly / 1080) * box.height);

// Slot 22 = i=21, 4-col grid, row5 col1 → centre ~ (960+? ) compute below.
await click(1188, 980);            // Jungle Swing card (slot 22)
await sleep(1600);
await page.screenshot({ path: '/tmp/slotart/js1-idle.png' });

// SWING to release the monkey; he now swings continuously.
await click(1758, 430);            // SWING (start)
await sleep(150);
await page.screenshot({ path: '/tmp/slotart/js-swing-a.png' });
await sleep(180);
await page.screenshot({ path: '/tmp/slotart/js-swing-b.png' });
await sleep(180);
await page.screenshot({ path: '/tmp/slotart/js-swing-c.png' });   // 3 frames = rope arc + timing meter

// Fire several timed JUMPs (random timing → some catch, some miss).
for (let i = 1; i <= 12; i++) {
    await click(1758, 430);        // JUMP
    await sleep(700);
    await page.screenshot({ path: `/tmp/slotart/js-jump${String(i).padStart(2, '0')}.png` });
    await sleep(500);
    // If we fell back to idle, start a fresh run.
}
await page.screenshot({ path: '/tmp/slotart/js-end.png' });
await browser.close();
console.log('ok');
