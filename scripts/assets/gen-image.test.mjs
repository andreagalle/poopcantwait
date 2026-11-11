import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildRequest, ENDPOINT, main, STYLE_BLOCK } from './gen-image.mjs';

const KEY = 'test-key-not-real';
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

describe('assets:image', () => {
    let outRoot;
    let logs;
    beforeAll(async () => {
        outRoot = await mkdtemp(path.join(tmpdir(), 'gen-image-'));
    });
    afterAll(async () => {
        await rm(outRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });
    const capture = () => {
        logs = [];
        vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
        vi.spyOn(console, 'error').mockImplementation((...a) => logs.push(a.join(' ')));
    };

    it('starts every prompt with the style block unless asked not to', () => {
        expect(buildRequest({ prompt: 'a burger', raw: false }).prompt).toBe(`${STYLE_BLOCK} a burger`);
        expect(buildRequest({ prompt: 'a burger', raw: true }).prompt).toBe('a burger');
    });

    it('prints the plan and sends nothing without --yes', async () => {
        capture();
        const fetchImpl = vi.fn();
        const code = await main(['food.burger', '--prompt', 'a burger', '--model', 'some/model'], {
            env: { OPENROUTER_API_KEY: KEY },
            fetchImpl,
            outRoot
        });
        expect(code).toBe(2);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(logs.join('\n')).toContain('Not sent');
        expect(logs.join('\n')).not.toContain(KEY);
    });

    it('refuses without a model, a valid asset id or a key', async () => {
        capture();
        const fetchImpl = vi.fn();
        expect(await main(['food.burger', '--prompt', 'x', '--yes'], { env: {}, fetchImpl, outRoot })).toBe(1);
        expect(await main(['Burger', '--prompt', 'x', '--model', 'm', '--yes'], { env: {}, fetchImpl, outRoot })).toBe(
            1
        );
        expect(
            await main(['food.burger', '--prompt', 'x', '--model', 'm', '--yes'], { env: {}, fetchImpl, outRoot })
        ).toBe(1);
        expect(
            await main(['food.burger', '--prompt', 'x', '--model', 'm', '--format', 'bmp'], {
                env: {},
                fetchImpl,
                outRoot
            })
        ).toBe(1);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('sends the request with the key and saves the images and a sidecar, never the key', async () => {
        capture();
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                data: [{ b64_json: PNG.toString('base64'), media_type: 'image/png' }],
                usage: { cost: 0.04 }
            })
        }));
        const code = await main(['char.benny', '--prompt', 'front view', '--model', 'some/model', '--yes'], {
            env: { OPENROUTER_API_KEY: KEY },
            fetchImpl,
            outRoot,
            now: () => new Date('2026-11-08T12:00:00Z')
        });
        expect(code).toBe(0);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe(ENDPOINT);
        expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
        const body = JSON.parse(init.body);
        expect(body).toMatchObject({ model: 'some/model', n: 1, aspect_ratio: '1:1', output_format: 'png' });
        expect(body.prompt.startsWith(STYLE_BLOCK)).toBe(true);

        const files = (await readdir(path.join(outRoot, 'char.benny'))).sort();
        expect(files).toEqual(['2026-11-08T12-00-00-000Z-1.png', '2026-11-08T12-00-00-000Z.json']);
        const sidecar = await readFile(path.join(outRoot, 'char.benny', files[1]), 'utf8');
        expect(JSON.parse(sidecar)).toMatchObject({ model: 'some/model', cost: 0.04, files: [files[0]] });
        expect(sidecar).not.toContain(KEY);
        expect(logs.join('\n')).not.toContain(KEY);
    });

    it('reports API errors without saving anything', async () => {
        capture();
        const fetchImpl = vi.fn(async () => ({ ok: false, status: 402, text: async () => 'insufficient credits' }));
        const code = await main(['food.donut', '--prompt', 'x', '--model', 'm', '--yes'], {
            env: { OPENROUTER_API_KEY: KEY },
            fetchImpl,
            outRoot
        });
        expect(code).toBe(1);
        expect(logs.join('\n')).toContain('402');
        await expect(readdir(path.join(outRoot, 'food.donut'))).rejects.toThrow();
    });
});
