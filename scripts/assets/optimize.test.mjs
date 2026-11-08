import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { countTriangles, main, PRESETS } from './optimize.mjs';

/** A dense, bumpy grid (about 7,200 triangles) with a 2048 px texture and some extras, written as a GLB. */
async function denseModel(file) {
    const document = new Document();
    const buffer = document.createBuffer();
    const n = 61;
    const positions = [];
    const uvs = [];
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            positions.push(i / (n - 1), 0.1 * Math.sin(i * 0.7) * Math.cos(j * 0.5), j / (n - 1));
            uvs.push(i / (n - 1), j / (n - 1));
        }
    }
    const indices = [];
    for (let j = 0; j + 1 < n; j++) {
        for (let i = 0; i + 1 < n; i++) {
            const a = j * n + i;
            indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
        }
    }
    // A noisy texture: prune() would fold a single-colour one into the material colour
    const png = await sharp({
        create: { width: 2048, height: 2048, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } }
    })
        .png()
        .toBuffer();
    const texture = document.createTexture('albedo').setImage(new Uint8Array(png)).setMimeType('image/png');
    const material = document.createMaterial('paint').setBaseColorTexture(texture).setExtras({ generator: 'secret' });
    const primitive = document
        .createPrimitive()
        .setAttribute(
            'POSITION',
            document.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer)
        )
        .setAttribute(
            'TEXCOORD_0',
            document.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer)
        )
        .setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer))
        .setMaterial(material);
    const mesh = document.createMesh('grid').addPrimitive(primitive);
    const node = document.createNode('grid').setMesh(mesh).setExtras({ note: 'drop me' });
    document.createScene().addChild(node);
    await new NodeIO().writeBinary(document).then((bytes) => writeFile(file, bytes));
    return countTriangles(document);
}

describe('assets:optimize', () => {
    let dir;
    beforeAll(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'optimize-'));
    });
    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('simplifies a model to the preset budget, shrinks textures to WebP and strips extras', async () => {
        const input = path.join(dir, 'dense.glb');
        const output = path.join(dir, 'out', 'dense.glb');
        expect(await denseModel(input)).toBe(7200);
        expect(await main([input, output, '--preset', 'food'])).toBe(0);

        const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
        const result = await io.read(output);
        expect(countTriangles(result)).toBeLessThanOrEqual(PRESETS.food.maxTriangles);
        const [texture] = result.getRoot().listTextures();
        expect(texture.getMimeType()).toBe('image/webp');
        const meta = await sharp(Buffer.from(texture.getImage())).metadata();
        expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(PRESETS.food.maxTexture);
        expect(result.getRoot().listNodes()[0].getExtras()).toEqual({});
        expect(result.getRoot().listMaterials()[0].getExtras()).toEqual({});
    }, 60_000);

    it('honours a triangle budget override', async () => {
        const input = path.join(dir, 'dense2.glb');
        const output = path.join(dir, 'dense2-out.glb');
        await denseModel(input);
        expect(await main([input, output, '--preset', 'hero', '--max-triangles', '3000'])).toBe(0);
        const result = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(output);
        expect(countTriangles(result)).toBeLessThanOrEqual(3000);
    }, 60_000);

    it('resizes images to WebP within the texture budget', async () => {
        const input = path.join(dir, 'facade.png');
        const output = path.join(dir, 'facade.webp');
        await sharp({ create: { width: 3000, height: 1500, channels: 3, background: '#c8e6c9' } })
            .png()
            .toFile(input);
        expect(await main([input, output, '--preset', 'texture'])).toBe(0);
        const meta = await sharp(output).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.width).toBe(1024);
        expect(meta.height).toBe(512);
    });

    it('refuses unknown presets, file types and output formats', async () => {
        const input = path.join(dir, 'facade.png');
        expect(await main([input, path.join(dir, 'x.webp')])).toBe(1);
        expect(await main([path.join(dir, 'notes.txt'), path.join(dir, 'x.glb'), '--preset', 'prop'])).toBe(1);
        expect(await main([input, path.join(dir, 'x.png'), '--preset', 'texture'])).toBe(1);
    });
});
