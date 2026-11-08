/**
 * Every runtime asset, by dotted id, mapped to its file under `public/assets/` (docs/ASSET_PIPELINE.md, Conventions).
 * Every committed asset has an entry here and in `art/manifest.json`. Empty until the art pass (milestone M6) lands
 * its first asset; the greybox stands in until then.
 */
export interface AssetEntry {
    readonly kind: 'model' | 'texture' | 'image' | 'audio';
    /** Path under `public/assets/`, for example `models/food/burger.glb`. */
    readonly file: string;
}

export const ASSETS = {} as const satisfies Record<string, AssetEntry>;

export type AssetId = keyof typeof ASSETS;

/**
 * The URL of an asset file, relative to the page (`./assets/...` with the default base), so the build works under the
 * GitHub Pages subpath. Never `/assets/...`.
 */
export function assetUrl(file: string, base: string = import.meta.env.BASE_URL): string {
    const prefix = base.endsWith('/') ? base : `${base}/`;
    return `${prefix}assets/${file.replace(/^\/+/, '')}`;
}
