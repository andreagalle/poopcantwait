#!/usr/bin/env node
/**
 * Optimizes a raw generated model or image into public/assets/ (docs/ASSET_PIPELINE.md, Optimization).
 *
 *   npm run assets:optimize -- <input> <output> --preset <hero|vehicle|prop|food|texture>
 *                              [--max-triangles <n>] [--max-texture <px>] [--quantize]
 *
 * Models (.glb, .gltf): strip extras, dedup, prune, weld, simplify to the preset's triangle budget with meshoptimizer,
 * resize textures to the preset's maximum and convert them to WebP (EXT_texture_webp, which the engine reads).
 * --quantize also quantizes vertex attributes (KHR_mesh_quantization): load the result in the game before keeping it.
 * Images (.png, .jpg, .jpeg, .webp): resize to the preset's maximum and write WebP.
 * Prints triangles, texture sizes and bytes before and after.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

/** Budgets from docs/ASSET_PIPELINE.md. Override per asset with --max-triangles (a bus: 6000; a kiosk: 3000). */
export const PRESETS = {
    hero: { maxTriangles: 20_000, maxTexture: 1024 },
    vehicle: { maxTriangles: 4_000, maxTexture: 512 },
    prop: { maxTriangles: 1_000, maxTexture: 256 },
    food: { maxTriangles: 1_500, maxTexture: 256 },
    texture: { maxTriangles: 0, maxTexture: 1024 }
};

const MODEL_EXTENSIONS = new Set(['.glb', '.gltf']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/** Triangles across every mesh primitive (each mesh counted once, however many nodes use it). */
export function countTriangles(document) {
    let triangles = 0;
    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            if (primitive.getMode() !== 4) {
                continue;
            }
            const indices = primitive.getIndices();
            const count = indices ? indices.getCount() : (primitive.getAttribute('POSITION')?.getCount() ?? 0);
            triangles += Math.floor(count / 3);
        }
    }
    return triangles;
}

async function textureSizes(document) {
    const sizes = [];
    for (const texture of document.getRoot().listTextures()) {
        const image = texture.getImage();
        if (image) {
            const meta = await sharp(Buffer.from(image)).metadata();
            sizes.push(`${meta.width}x${meta.height} ${texture.getMimeType()}`);
        }
    }
    return sizes;
}

/** Removes extras (free-form metadata) from everything in the document. */
function stripExtras(document) {
    const root = document.getRoot();
    root.setExtras({});
    root.getAsset().extras = undefined;
    const lists = [
        root.listNodes(),
        root.listMeshes(),
        root.listMaterials(),
        root.listTextures(),
        root.listScenes(),
        root.listAnimations(),
        root.listSkins(),
        root.listAccessors(),
        root.listCameras(),
        root.listBuffers()
    ];
    for (const list of lists) {
        for (const property of list) {
            property.setExtras({});
        }
    }
    for (const mesh of root.listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            primitive.setExtras({});
        }
    }
}

/** Optimizes a model document in place to the given budgets; returns the triangle counts before and after. */
export async function optimizeDocument(document, { maxTriangles, maxTexture, quantize: doQuantize = false }) {
    const before = countTriangles(document);
    stripExtras(document);
    await document.transform(dedup(), prune(), weld());
    if (maxTriangles > 0 && before > maxTriangles) {
        await MeshoptSimplifier.ready;
        // meshoptimizer stops short of the ratio when it would break the error bound: repeat with a looser bound
        for (const error of [0.001, 0.01, 0.05]) {
            const current = countTriangles(document);
            if (current <= maxTriangles) {
                break;
            }
            await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio: maxTriangles / current, error }));
        }
    }
    if (document.getRoot().listTextures().length > 0) {
        await document.transform(
            textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTexture, maxTexture] })
        );
    }
    if (doQuantize) {
        await document.transform(quantize());
    }
    await document.transform(prune());
    return { before, after: countTriangles(document) };
}

export async function optimizeImage(input, output, maxTexture) {
    await sharp(input)
        .resize({ width: maxTexture, height: maxTexture, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(output);
}

function parseArgs(argv) {
    const positional = [];
    const options = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--quantize') {
            options.quantize = true;
        } else if (arg.startsWith('--')) {
            options[arg.slice(2)] = argv[++i];
        } else {
            positional.push(arg);
        }
    }
    return { positional, options };
}

export async function main(argv) {
    const { positional, options } = parseArgs(argv);
    const [input, output] = positional;
    const preset = PRESETS[options.preset];
    if (!input || !output || !preset) {
        console.error(
            'Usage: npm run assets:optimize -- <input> <output> --preset <hero|vehicle|prop|food|texture> ' +
                '[--max-triangles <n>] [--max-texture <px>] [--quantize]'
        );
        return 1;
    }
    const maxTriangles = options['max-triangles'] ? Number(options['max-triangles']) : preset.maxTriangles;
    const maxTexture = options['max-texture'] ? Number(options['max-texture']) : preset.maxTexture;
    const inExt = path.extname(input).toLowerCase();
    const outExt = path.extname(output).toLowerCase();
    if (!MODEL_EXTENSIONS.has(inExt) && !IMAGE_EXTENSIONS.has(inExt)) {
        console.error(`Refusing ${input}: only .glb, .gltf, .png, .jpg and .webp are accepted.`);
        return 1;
    }
    await mkdir(path.dirname(output), { recursive: true });
    const bytesBefore = (await stat(input)).size;

    if (IMAGE_EXTENSIONS.has(inExt)) {
        if (outExt !== '.webp') {
            console.error('Images are written as WebP: give the output a .webp name.');
            return 1;
        }
        const meta = await sharp(input).metadata();
        await optimizeImage(input, output, maxTexture);
        const out = await sharp(output).metadata();
        console.log(`image     ${meta.width}x${meta.height} -> ${out.width}x${out.height}`);
    } else {
        if (outExt !== '.glb') {
            console.error('Models are written as binary glTF: give the output a .glb name.');
            return 1;
        }
        const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
        const document = await io.read(input);
        const texturesBefore = await textureSizes(document);
        const triangles = await optimizeDocument(document, { maxTriangles, maxTexture, quantize: options.quantize });
        await writeFile(output, await io.writeBinary(document));
        console.log(`triangles ${triangles.before} -> ${triangles.after} (budget ${maxTriangles})`);
        console.log(
            `textures  ${texturesBefore.join(', ') || 'none'} -> ${(await textureSizes(document)).join(', ') || 'none'}`
        );
        if (triangles.after > maxTriangles) {
            console.warn(`Still over budget: remesh it first (meshy_remesh), then optimize again.`);
        }
    }
    const bytesAfter = (await stat(output)).size;
    console.log(`bytes     ${bytesBefore} -> ${bytesAfter}`);
    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    process.exitCode = await main(process.argv.slice(2));
}
