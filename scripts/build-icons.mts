// Renders app/icon.svg to the PNG sizes browsers want and packs favicon.ico (PNG-in-ICO, 16/32/48).
// Run after editing app/icon.svg:  npx tsx scripts/build-icons.mts   (needs Playwright's Chromium; see tests/run.sh)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
const svg = readFileSync('app/icon.svg', 'utf8');
const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
const render = async (size: number, fullBleed = false) => {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const src = fullBleed ? svg.replace('rx="14"', 'rx="0"') : svg;
    await page.setContent(`<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    return png;
};
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map(s => render(s)));
// ICO: 6-byte header, a 16-byte entry per image, then the PNG data
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s, 0); e.writeUInt8(s, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
});
writeFileSync('app/favicon.ico', Buffer.concat([header, ...entries, ...pngs]));
writeFileSync('app/apple-icon.png', await render(180, true));
await browser.close();
console.log('wrote app/favicon.ico (16, 32, 48) and app/apple-icon.png (180)');
