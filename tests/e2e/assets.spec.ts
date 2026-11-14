import { expect, test } from '@playwright/test';

import { openGame } from './helpers';

// The models of the art pass (src/assets/registry.ts) load from ./assets/ under the Pages subpath, without errors
test('loads every model of the art pass', async ({ page }) => {
    const errors = await openGame(page, '?seed=42', false);
    const models = await page.evaluate(() => {
        const app = [...globalThis.__playcanvasApps!.keys()][0]!;
        return app.assets
            .filter((asset) => asset.type === 'container')
            .map((asset) => ({ name: asset.name, loaded: asset.loaded, url: asset.getFileUrl() ?? '' }));
    });
    expect(models.map((m) => m.name)).toContain('food.burger');
    for (const model of models) {
        expect(model.loaded, model.name).toBe(true);
        expect(model.url).toMatch(/^\.\/assets\/models\//);
    }
    expect(errors).toEqual([]);
});
