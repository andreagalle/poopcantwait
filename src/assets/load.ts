import { Asset, AssetListLoader } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { ASSETS, assetUrl } from './registry';
import type { AssetId } from './registry';

/**
 * Loads models from the registry as `container` assets (docs/ASSET_PIPELINE.md). Resolves with the ones that loaded:
 * a model that fails to load is left out, and whatever it stands for keeps its greybox stand-in, so a missing file
 * never stops the game.
 */
export async function loadModels(app: AppBase, ids: readonly AssetId[]): Promise<Map<AssetId, Asset>> {
    const assets = ids.map((id) => new Asset(id, 'container', { url: assetUrl(ASSETS[id].file) }));
    for (const asset of assets) {
        app.assets.add(asset);
    }
    await new Promise<void>((resolve) => new AssetListLoader(assets, app.assets).load(() => resolve()));
    const loaded = new Map<AssetId, Asset>();
    ids.forEach((id, i) => {
        if (assets[i].loaded && assets[i].resource) {
            loaded.set(id, assets[i]);
        }
    });
    return loaded;
}
