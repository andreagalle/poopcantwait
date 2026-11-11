#!/usr/bin/env node
/**
 * Generates 2D images through the OpenRouter Images API (docs/ASSET_PIPELINE.md, 2D images through OpenRouter). Paid.
 *
 *   npm run assets:image -- <asset-id> --prompt "<description>" --model <slug> [--n 1] [--aspect 1:1]
 *                           [--quality low|medium|high] [--background transparent|opaque] [--resolution 1K]
 *                           [--format png|jpeg|webp] [--reference <image>]... [--raw] --yes
 *
 * Only the options given are sent: models support different parameters (gpt-image-1 takes quality and background but
 * no resolution), and the aspect ratio defaults to 1:1. Each --reference image (PNG, JPEG or WebP, at most 4) goes
 * along as an input reference, to keep a character the same from one view to the next.
 *
 * Without --yes it prints the plan and stops, so every paid call is deliberate. The model comes from --model or
 * OPENROUTER_IMAGE_MODEL. The prompt starts with the style block below unless --raw is given. Images and a JSON
 * sidecar (model, prompt, parameters, date, cost when reported) go to art/raw/images/<asset-id>/, which git ignores.
 * The API key comes from OPENROUTER_API_KEY and is never printed or written anywhere.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENDPOINT = 'https://openrouter.ai/api/v1/images';

/** The style block every generation prompt starts with (docs/ASSET_PIPELINE.md, Style block). */
export const STYLE_BLOCK =
    'Stylized toy-town diorama game asset. Chunky, rounded, simple shapes with strong silhouettes, readable from a ' +
    'high top-down camera. Soft pastel palette with a few saturated accents, smooth shading, minimal fine detail. ' +
    'Single object, centered, neutral plain background. No text, no letters, no logos, no brand marks.';

const ASSET_ID = /^[a-z]+(\.[a-z0-9-]+)+$/;
const FORMATS = { png: 'png', jpeg: 'jpg', webp: 'webp' };
const QUALITIES = new Set(['auto', 'low', 'medium', 'high']);
const BACKGROUNDS = new Set(['auto', 'transparent', 'opaque']);
const REFERENCE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const MAX_REFERENCES = 4;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
    const positional = [];
    const options = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--yes' || arg === '--raw') {
            options[arg.slice(2)] = true;
        } else if (arg === '--reference') {
            (options.reference ??= []).push(argv[++i]);
        } else if (arg.startsWith('--')) {
            options[arg.slice(2)] = argv[++i];
        } else {
            positional.push(arg);
        }
    }
    return { positional, options };
}

/**
 * The request body for a plan, everything except the key. Optional fields are left out unless given, because a model
 * may refuse a parameter it does not support.
 */
export function buildRequest({ model, prompt, raw, n, aspect, quality, background, resolution, format, references }) {
    const request = { model, prompt: raw ? prompt : `${STYLE_BLOCK} ${prompt}`, n, aspect_ratio: aspect };
    if (quality) {
        request.quality = quality;
    }
    if (background) {
        request.background = background;
    }
    if (resolution) {
        request.resolution = resolution;
    }
    if (format) {
        request.output_format = format;
    }
    if (references && references.length > 0) {
        request.input_references = references.map((url) => ({ type: 'image_url', image_url: { url } }));
    }
    return request;
}

/** A reference image as a data URL; only PNG, JPEG and WebP files are read. */
async function referenceUrl(file) {
    const type = REFERENCE_TYPES[path.extname(file).toLowerCase()];
    if (!type) {
        throw new Error(`Reference ${file} is not a PNG, JPEG or WebP image.`);
    }
    return `data:${type};base64,${(await readFile(file)).toString('base64')}`;
}

/**
 * Runs the command. `env`, `fetchImpl`, `outRoot` and `now` are injectable so tests never spend credits or touch the
 * real art folder. Returns the process exit code.
 */
export async function main(
    argv,
    { env = process.env, fetchImpl = fetch, outRoot = path.join(REPO, 'art/raw/images'), now = () => new Date() } = {}
) {
    const { positional, options } = parseArgs(argv);
    const [assetId] = positional;
    if (!assetId || !ASSET_ID.test(assetId) || !options.prompt) {
        console.error('Usage: npm run assets:image -- <asset-id like char.benny> --prompt "<description>" [--yes]');
        return 1;
    }
    const model = options.model ?? env.OPENROUTER_IMAGE_MODEL;
    if (!model) {
        console.error('No model: pass --model <slug> or set OPENROUTER_IMAGE_MODEL.');
        console.error('List candidates and prices with GET https://openrouter.ai/api/v1/images/models.');
        return 1;
    }
    const format = options.format;
    if (format !== undefined && !(format in FORMATS)) {
        console.error(`Unsupported format ${format}: use png, jpeg or webp.`);
        return 1;
    }
    if (options.quality !== undefined && !QUALITIES.has(options.quality)) {
        console.error(`Unsupported quality ${options.quality}: use auto, low, medium or high.`);
        return 1;
    }
    if (options.background !== undefined && !BACKGROUNDS.has(options.background)) {
        console.error(`Unsupported background ${options.background}: use auto, transparent or opaque.`);
        return 1;
    }
    const referenceFiles = options.reference ?? [];
    if (referenceFiles.length > MAX_REFERENCES) {
        console.error(`At most ${MAX_REFERENCES} reference images.`);
        return 1;
    }
    let references;
    try {
        references = await Promise.all(referenceFiles.map(referenceUrl));
    } catch (error) {
        console.error(error.message);
        return 1;
    }
    const n = Math.min(4, Math.max(1, Number(options.n ?? 1)));
    const request = buildRequest({
        model,
        prompt: options.prompt,
        raw: options.raw === true,
        n,
        aspect: options.aspect ?? '1:1',
        quality: options.quality,
        background: options.background,
        resolution: options.resolution,
        format,
        references
    });

    const extras = ['quality', 'background', 'resolution', 'output_format'].filter((k) => k in request);
    console.log(`asset   ${assetId}`);
    console.log(`model   ${model}`);
    console.log(`images  ${n} at ${request.aspect_ratio}${extras.map((k) => `, ${k} ${request[k]}`).join('')}`);
    if (referenceFiles.length > 0) {
        console.log(`refs    ${referenceFiles.join(', ')}`);
    }
    console.log(`prompt  ${request.prompt}`);
    if (options.yes !== true) {
        console.log('Not sent: this call costs credits. Add --yes once the maintainer has approved it.');
        return 2;
    }
    if (!env.OPENROUTER_API_KEY) {
        console.error('OPENROUTER_API_KEY is not set: add it as a Codespaces secret and rebuild the container.');
        return 1;
    }

    const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Title': 'Gotta Go asset pipeline'
        },
        body: JSON.stringify(request)
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error(`OpenRouter answered ${response.status}: ${text.slice(0, 500)}`);
        return 1;
    }
    const result = await response.json();
    const images = Array.isArray(result.data) ? result.data.filter((d) => typeof d.b64_json === 'string') : [];
    if (images.length === 0) {
        console.error('The response held no image.');
        return 1;
    }

    const stamp = now().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(outRoot, assetId);
    await mkdir(dir, { recursive: true });
    const files = [];
    for (const [i, image] of images.entries()) {
        const ext = FORMATS[image.media_type?.split('/')[1]] ?? FORMATS[format ?? 'png'];
        const file = path.join(dir, `${stamp}-${i + 1}.${ext}`);
        await writeFile(file, Buffer.from(image.b64_json, 'base64'));
        files.push(path.basename(file));
    }
    const sidecar = {
        assetId,
        provider: 'openrouter',
        endpoint: ENDPOINT,
        model,
        prompt: request.prompt,
        parameters: Object.fromEntries(
            Object.entries(request).filter(([key]) => !['model', 'prompt', 'input_references'].includes(key))
        ),
        references: referenceFiles.map((file) => path.relative(REPO, path.resolve(file))),
        generatedAt: now().toISOString(),
        cost: result.usage?.cost ?? null,
        files
    };
    await writeFile(path.join(dir, `${stamp}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
    console.log(`saved   ${files.map((f) => path.join(path.relative(REPO, dir), f)).join(', ')}`);
    if (sidecar.cost !== null) {
        console.log(`cost    ${sidecar.cost}`);
    }
    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    process.exitCode = await main(process.argv.slice(2));
}
