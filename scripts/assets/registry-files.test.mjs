import { existsSync, readFileSync, statSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ASSETS } from '../../src/assets/registry.ts';

/** Every asset in the registry is a committed file with its provenance in art/manifest.json (docs/ASSET_PIPELINE.md). */
describe('asset files', () => {
    const manifest = JSON.parse(readFileSync('art/manifest.json', 'utf8'));

    for (const [id, entry] of Object.entries(ASSETS)) {
        it(`${id} is in public/assets/ and in the manifest, with its real size`, () => {
            const file = `public/assets/${entry.file}`;
            expect(existsSync(file), file).toBe(true);
            const record = manifest.assets.find((a) => a.id === id);
            expect(record, id).toBeDefined();
            expect(record.file).toBe(file);
            expect(record.bytes).toBe(statSync(file).size);
            expect(typeof record.license).toBe('string');
        });
    }

    it('lists nothing in the manifest that the registry does not know', () => {
        for (const record of manifest.assets) {
            expect(Object.keys(ASSETS)).toContain(record.id);
        }
    });
});
