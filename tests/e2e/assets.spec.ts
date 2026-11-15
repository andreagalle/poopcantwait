import { expect, test } from '@playwright/test';

import { openGame } from './helpers';

// The models and textures of the art pass (src/assets/registry.ts) load from ./assets/ under the Pages subpath, without
// errors
test('loads every model and texture of the art pass', async ({ page }) => {
    const errors = await openGame(page, '?seed=42', false);
    const assets = await page.evaluate(() => {
        const app = [...globalThis.__playcanvasApps!.keys()][0]!;
        return app.assets
            .filter((asset) => asset.type === 'container' || asset.name.startsWith('texture.'))
            .map((asset) => ({
                name: asset.name,
                type: asset.type,
                loaded: asset.loaded,
                url: asset.getFileUrl() ?? ''
            }));
    });
    const names = assets.map((a) => a.name);
    expect(names).toContain('food.burger');
    expect(names).toContain('tree.lime');
    expect(names).toContain('texture.facade-felt');
    for (const asset of assets) {
        expect(asset.loaded, asset.name).toBe(true);
        expect(asset.url).toMatch(asset.type === 'container' ? /^\.\/assets\/models\// : /^\.\/assets\/textures\//);
    }
    expect(errors).toEqual([]);
});
