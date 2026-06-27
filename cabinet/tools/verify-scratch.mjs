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
const sx = (lx) => box.x + (lx / 1920) * box.width;
const sy = (ly) => box.y + (ly / 1080) * box.height;
const click = async (lx, ly) => page.mouse.click(sx(lx), sy(ly));

await click(1268, 992);            // Lucky Scratch card (slot 17)
await sleep(1500);
await page.screenshot({ path: '/tmp/slotart/sc1-idle.png' });

await click(1758, 400);            // BUY PACK
await sleep(900);
await page.screenshot({ path: '/tmp/slotart/sc2-pack.png' });

// Drag-scratch card 0 (foil ~ x 200..560, y 360..740): zig-zag strokes.
await page.mouse.move(sx(220), sy(400));
await page.mouse.down();
for (let row = 0; row < 6; row++) {
    const y = 400 + row * 56;
    const xs = row % 2 === 0 ? [220, 540] : [540, 220];
    for (let s = 0; s <= 12; s++) {
        const x = xs[0] + ((xs[1] - xs[0]) * s) / 12;
        await page.mouse.move(sx(x), sy(y));
    }
}
await page.mouse.up();
await sleep(900);
await page.screenshot({ path: '/tmp/slotart/sc3-dragged.png' });

await click(1758, 620);            // SCRATCH ALL (reveals remaining)
await sleep(2600);
await page.screenshot({ path: '/tmp/slotart/sc4-revealed.png' });
await sleep(1400);
await page.screenshot({ path: '/tmp/slotart/sc5-settled.png' });

// Second pack to confirm reset + a fresh outcome.
await click(1758, 400);            // NEW PACK
await sleep(900);
await click(1758, 620);            // SCRATCH ALL
await sleep(2600);
await page.screenshot({ path: '/tmp/slotart/sc6-pack2.png' });
await browser.close();
console.log('ok');
