/**
 * Every runtime asset, by dotted id, mapped to its file under `public/assets/` (docs/ASSET_PIPELINE.md, Conventions).
 * Every committed asset has an entry here and in `art/manifest.json`. The art pass (milestone M6) adds them one set at a
 * time; anything without an asset keeps its greybox stand-in.
 */
export interface AssetEntry {
    readonly kind: 'model' | 'texture' | 'image' | 'audio';
    /** Path under `public/assets/`, for example `models/food/burger.glb`. */
    readonly file: string;
}

export const ASSETS = {
    'food.burger': { kind: 'model', file: 'models/food/burger.glb' },
    'food.chicken-leg': { kind: 'model', file: 'models/food/chicken-leg.glb' },
    'food.pizza-slice': { kind: 'model', file: 'models/food/pizza-slice.glb' },
    'food.hot-dog': { kind: 'model', file: 'models/food/hot-dog.glb' },
    'food.donut': { kind: 'model', file: 'models/food/donut.glb' },
    'food.fries': { kind: 'model', file: 'models/food/fries.glb' },
    'food.ice-cream-cone': { kind: 'model', file: 'models/food/ice-cream-cone.glb' },
    'food.beans': { kind: 'model', file: 'models/food/beans.glb' },
    'food.cabbage': { kind: 'model', file: 'models/food/cabbage.glb' },
    'food.brussels-sprouts': { kind: 'model', file: 'models/food/brussels-sprouts.glb' },
    'food.broccoli': { kind: 'model', file: 'models/food/broccoli.glb' },
    'food.cauliflower': { kind: 'model', file: 'models/food/cauliflower.glb' },
    'food.carrot': { kind: 'model', file: 'models/food/carrot.glb' }
} as const satisfies Record<string, AssetEntry>;

export type AssetId = keyof typeof ASSETS;

/**
 * The URL of an asset file, relative to the page (`./assets/...` with the default base), so the build works under the
 * GitHub Pages subpath. Never `/assets/...`.
 */
export function assetUrl(file: string, base: string = import.meta.env.BASE_URL): string {
    const prefix = base.endsWith('/') ? base : `${base}/`;
    return `${prefix}assets/${file.replace(/^\/+/, '')}`;
}
