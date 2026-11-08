import { normalizeSeed } from './rng';

/** Options read from the page URL. Debug aids are opt-in and never change gameplay when absent. */
export interface LaunchParams {
    /** `?seed=<n>` fixes the run; `null` means "pick a random seed". */
    readonly seed: number | null;
    /** `?debug=1` shows the debug overlays. */
    readonly debug: boolean;
}

/** Parses a URL query string such as `?seed=42&debug=1`. Malformed values are ignored. */
export function parseLaunchParams(search: string): LaunchParams {
    const params = new URLSearchParams(search);
    const seedText = params.get('seed')?.trim() ?? '';
    const seed = /^-?\d{1,15}$/.test(seedText) ? normalizeSeed(Number(seedText)) : null;
    const debugText = params.get('debug');
    return { seed, debug: debugText === '1' || debugText === 'true' };
}
