#!/usr/bin/env node
/**
 * Builds the facade atlas (texture.facade-atlas, docs/ASSET_PIPELINE.md): 4 by 4 tiles of 512 px, in the order of
 * `SLOT` in src/render/facades.ts. The eight shops keep their colours; the residential tiles have their wall scaled to
 * white so each building's colour tints them; a plain wall and felt roof tiles fill the last two slots.
 *
 *   node scripts/assets/facade-atlas.mjs   then   npm run assets:optimize -- tmp/facade-atlas.png \
 *       public/assets/textures/facade-atlas.webp --preset texture --max-texture 1024
 *
 * It reads the generated images under art/raw/images/ (git-ignored: run it where they are).
 */
import { readdirSync } from 'node:fs';

import sharp from 'sharp';

const pick = (id) => {
    const dir = `art/raw/images/${id}`;
    return `${dir}/${
        readdirSync(dir)
            .filter((f) => f.endsWith('.png'))
            .sort()[0]
    }`;
};
const slots = [
    ['shop.ice-cream', false],
    ['shop.pet-shop', false],
    ['shop.hardware', false],
    ['shop.fishmonger', false],
    ['shop.cafe', false],
    ['shop.tailor', false],
    ['shop.greengrocer', false],
    ['shop.bike-repair', false],
    ['facade.window-shutters', true],
    ['facade.window-open', true],
    ['facade.window-balcony', true],
    ['facade.window-closed', true],
    ['facade.front-door', true],
    ['facade.ground-window', true],
    ['plain', true],
    ['roof-tiles', true]
];
const TILE = 512;
async function tile(id, normalize) {
    let img;
    if (id === 'roof-tiles') {
        // Felt roof tiles: rows of scallops, each row offset by half a tile, with stitched seams, over the felt grain
        const rows = 8;
        const cols = 6;
        const w = TILE / cols;
        const hgt = TILE / rows;
        let shapes = '';
        for (let r = rows; r >= -1; r--) {
            for (let c = -1; c <= cols; c++) {
                const x = c * w + (r % 2 === 0 ? 0 : w / 2);
                const y = r * hgt;
                const path = `M ${x} ${y} L ${x} ${y + hgt * 0.55} A ${w / 2} ${hgt * 0.75} 0 0 0 ${x + w} ${y + hgt * 0.55} L ${x + w} ${y} Z`;
                shapes += `<path d="${path}" fill="#ffffff" stroke="#c9c3b8" stroke-width="3"/>`;
                shapes += `<path d="M ${x + 6} ${y + hgt * 0.55} A ${w / 2 - 6} ${hgt * 0.75 - 6} 0 0 0 ${x + w - 6} ${y + hgt * 0.55}" fill="none" stroke="#b9b2a5" stroke-width="2" stroke-dasharray="6 5"/>`;
            }
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}"><rect width="100%" height="100%" fill="#e8e3da"/>${shapes}</svg>`;
        const pattern = await sharp(Buffer.from(svg)).png().toBuffer();
        const grain = await tile('plain', true);
        return sharp(pattern)
            .composite([{ input: grain, blend: 'multiply' }])
            .png()
            .toBuffer();
    }
    if (id === 'plain') {
        // Plain wall: a corner of the shuttered window's tile, mirrored into a 2x2 block so its edges meet
        const src = pick('facade.window-shutters');
        const crop = await sharp(src).removeAlpha().extract({ left: 30, top: 30, width: 200, height: 200 }).toBuffer();
        const parts = [
            crop,
            await sharp(crop).flop().toBuffer(),
            await sharp(crop).flip().toBuffer(),
            await sharp(crop).flip().flop().toBuffer()
        ];
        img = sharp({ create: { width: 400, height: 400, channels: 3, background: '#fff' } }).composite([
            { input: parts[0], left: 0, top: 0 },
            { input: parts[1], left: 200, top: 0 },
            { input: parts[2], left: 0, top: 200 },
            { input: parts[3], left: 200, top: 200 }
        ]);
        img = sharp(await img.png().toBuffer());
    } else {
        img = sharp(pick(id)).removeAlpha();
    }
    let buf = await img.resize(TILE, TILE).png().toBuffer();
    if (normalize) {
        // The wall's mean colour, along the tile's edges, scaled to white so the building's colour tints it
        const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
        const sum = [0, 0, 0];
        let n = 0;
        for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
                if (x > 40 && x < info.width - 40 && y > 40 && y < info.height - 40) continue;
                const i = (y * info.width + x) * 3;
                sum[0] += data[i];
                sum[1] += data[i + 1];
                sum[2] += data[i + 2];
                n++;
            }
        }
        buf = await sharp(buf)
            .linear(
                sum.map((s) => 245 / (s / n)),
                [0, 0, 0]
            )
            .png()
            .toBuffer();
    }
    return buf;
}
const tiles = await Promise.all(slots.map(([id, norm]) => tile(id, norm)));
await sharp({ create: { width: 4 * TILE, height: 4 * TILE, channels: 3, background: '#ffffff' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 4) * TILE, top: Math.floor(i / 4) * TILE })))
    .png()
    .toFile('tmp/facade-atlas.png');
console.log('done');
