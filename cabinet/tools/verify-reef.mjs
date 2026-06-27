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
const moveTo = async (lx, ly) => page.mouse.move(sx(lx), sy(ly));

await click(1576, 1006);           // Reef Hunter card (slot 18, last row, 3rd)
await sleep(1800);
await page.screenshot({ path: '/tmp/slotart/rf1-idle.png' });

const hunt = async (label, yBand) => {
    await click(1758, 372);        // START HUNT (buys a clip)
    await sleep(500);
    // Sweep the clip horizontally so harpoons fly up through fish columns.
    for (let i = 0; i < 10; i++) {
        const tx = 320 + (1120 * i) / 9;
        await moveTo(tx, yBand);
        await sleep(50);
        await click(tx, yBand);
        await sleep(300);
        if (i === 5) await page.screenshot({ path: `/tmp/slotart/rf-${label}-mid.png` });
    }
    await sleep(1500);             // clip empties → settle
    await page.screenshot({ path: `/tmp/slotart/rf-${label}-settle.png` });
};
await hunt('h1', 360);              // REEF (Lv 1)
await click(1866, 320);            // depth zone ›
await click(1866, 320);            // › to DEEP (Lv 3)
await sleep(400);
await page.screenshot({ path: '/tmp/slotart/rf-zone.png' });
await hunt('h2', 280);              // deeper zone
await hunt('h3', 440);
await browser.close();
console.log('ok');
