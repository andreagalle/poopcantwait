import { describe, expect, it } from 'vitest';

import { ASSETS, assetUrl } from './registry';

describe('asset registry', () => {
    it('builds relative URLs that work under the Pages subpath', () => {
        expect(assetUrl('models/food/burger.glb', './')).toBe('./assets/models/food/burger.glb');
        expect(assetUrl('/textures/facade.webp', './')).toBe('./assets/textures/facade.webp');
        expect(assetUrl('a.glb', '/poopcantwait')).toBe('/poopcantwait/assets/a.glb');
    });

    it('gives every entry a file under public/assets/ (scripts/assets/registry-files.test.mjs checks they exist)', () => {
        for (const entry of Object.values(ASSETS)) {
            expect(entry.file).toMatch(/^(models|textures|images|audio)\/[a-z0-9/-]+\.(glb|webp|png|ogg|mp3)$/);
        }
    });
});
