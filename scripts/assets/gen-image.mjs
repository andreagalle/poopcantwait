#!/usr/bin/env node
/**
 * Generates 2D images through the OpenRouter Images API (docs/ASSET_PIPELINE.md, 2D images through OpenRouter). Paid.
 *
 *   npm run assets:image -- <asset-id> --prompt "<description>" [--model <slug>] [--n 1] [--aspect 1:1]
 *                           [--resolution 1K] [--format png] [--raw] --yes
 *
 * Without --yes it prints the plan and stops, so every paid call is deliberate. The model comes from --model or
 * OPENROUTER_IMAGE_MODEL. The prompt starts with the style block below unless --raw is given. Images and a JSON
 * sidecar (model, prompt, parameters, date, cost when reported) go to art/raw/images/<asset-id>/, which git ignores.
 * The API key comes from OPENROUTER_API_KEY and is never printed or written anywhere.
 */
import { mkdir, writeFile } from 'node:fs/promises';
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
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
    const positional = [];
    const options = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--yes' || arg === '--raw') {
            options[arg.slice(2)] = true;
        } else if (arg.startsWith('--')) {
            options[arg.slice(2)] = argv[++i];
        } else {
            positional.push(arg);
        }
    }
    return { positional, options };
}

/** The request body for a plan: everything except the key. */
export function buildRequest({ model, prompt, raw, n, aspect, resolution, format }) {
    return {
        model,
        prompt: raw ? prompt : `${STYLE_BLOCK} ${prompt}`,
        n,
        aspect_ratio: aspect,
        resolution,
        output_format: format
    };
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
    const format = options.format ?? 'png';
    if (!(format in FORMATS)) {
        console.error(`Unsupported format ${format}: use png, jpeg or webp.`);
        return 1;
    }
    const n = Math.min(4, Math.max(1, Number(options.n ?? 1)));
    const request = buildRequest({
        model,
        prompt: options.prompt,
        raw: options.raw === true,
        n,
        aspect: options.aspect ?? '1:1',
        resolution: options.resolution ?? '1K',
        format
    });

    console.log(`asset   ${assetId}`);
    console.log(`model   ${model}`);
    console.log(`images  ${n} (${request.aspect_ratio}, ${request.resolution}, ${format})`);
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
        const ext = FORMATS[image.media_type?.split('/')[1]] ?? FORMATS[format];
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
        parameters: { n, aspect_ratio: request.aspect_ratio, resolution: request.resolution, output_format: format },
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
