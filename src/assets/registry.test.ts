import { describe, expect, it } from 'vitest';

import { ASSETS, assetUrl } from './registry';

describe('asset registry', () => {
    it('builds relative URLs that work under the Pages subpath', () => {
        expect(assetUrl('models/food/burger.glb', './')).toBe('./assets/models/food/burger.glb');
        expect(assetUrl('/textures/facade.webp', './')).toBe('./assets/textures/facade.webp');
        expect(assetUrl('a.glb', '/poopcantwait')).toBe('/poopcantwait/assets/a.glb');
    });

    it('starts empty: the greybox stands in until the art pass', () => {
        expect(Object.keys(ASSETS)).toEqual([]);
    });
});
