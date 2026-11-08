import { normalizeSeed } from './rng';

/** Options read from the page URL. Debug aids are opt-in and never change gameplay when absent. */
export interface LaunchParams {
    /** `?seed=<n>` fixes the run; `null` means "pick a random seed". */
    readonly seed: number | null;
    /** `?debug=1` shows the debug overlays. */
    readonly debug: boolean;
    /** `?weight=<0..1>` starts Benny at that weight, to test the girth tiers; `null` means slim. */
    readonly weight: number | null;
    /** `?countdown=<seconds>` shortens or lengthens the urgency countdown for testing; `null` means the design value. */
    readonly countdownSeconds: number | null;
}

/** Parses a non-negative decimal number such as `0.5`, `.82` or `12`; anything else gives `null`. */
function decimal(text: string | null): number | null {
    const trimmed = text?.trim() ?? '';
    return /^\d*\.?\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** Parses a URL query string such as `?seed=42&debug=1`. Malformed values are ignored. */
export function parseLaunchParams(search: string): LaunchParams {
    const params = new URLSearchParams(search);
    const seedText = params.get('seed')?.trim() ?? '';
    const seed = /^-?\d{1,15}$/.test(seedText) ? normalizeSeed(Number(seedText)) : null;
    const debugText = params.get('debug');
    const weight = decimal(params.get('weight'));
    const countdown = decimal(params.get('countdown'));
    return {
        seed,
        debug: debugText === '1' || debugText === 'true',
        weight: weight === null ? null : Math.min(1, weight),
        countdownSeconds: countdown === null ? null : Math.min(600, Math.max(1, countdown))
    };
}
