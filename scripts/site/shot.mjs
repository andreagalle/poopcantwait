#!/usr/bin/env node
/**
 * Turns a game screenshot into a light WebP for the story page (site/story/shots/).
 *
 *   npm run story:shot -- <input.png> <name> [--width <px>]
 *
 * The screenshot usually comes from tmp/screenshots/ (Playwright captures, git-ignored). The output is
 * site/story/shots/<name>.webp, at most 960 px wide (or --width, for sketches shown in a grid), metadata stripped. Reference it from site/story/index.html as
 * ./shots/<name>.webp.
 */
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const MAX_WIDTH = 960;
const QUALITY = 78;
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../site/story/shots');

const [input, name, flag, value] = process.argv.slice(2);
const width = flag === '--width' ? Number(value) : MAX_WIDTH;
if (!input || !name || !/^[a-z0-9-]+$/.test(name) || !(width >= 64 && width <= MAX_WIDTH)) {
    console.error('Usage: npm run story:shot -- <input.png|.jpg|.webp> <kebab-case-name> [--width <64..960>]');
    process.exit(1);
}
if (!/\.(png|jpe?g|webp)$/i.test(input)) {
    console.error(`Not an image this script accepts: ${input}`);
    process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
const output = path.join(OUT_DIR, `${name}.webp`);
const info = await sharp(input)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(output);
const before = (await stat(input)).size;
console.log(`${path.relative(process.cwd(), output)}: ${info.width}x${info.height}, ${before} -> ${info.size} bytes`);
