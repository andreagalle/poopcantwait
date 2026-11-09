import { EFFECTS } from '../../config/tuning';
import type { GameEvent } from '../game';

/**
 * Camera shake as "trauma" (design: *Game feel*): hits add trauma up to 1, it drains at a steady rate, and the camera
 * offset grows with trauma squared, so small bumps barely show and big hits jolt. The wobble is a sum of sines at
 * unrelated frequencies: it looks random but is the same every time.
 */

/** Trauma a game event adds; 0 for events that do not shake the camera. */
export function traumaFor(event: GameEvent): number {
    const { trauma } = EFFECTS.shake;
    switch (event) {
        case 'knocked':
            return trauma.knocked;
        case 'crumple':
            return trauma.crumple;
        case 'accident':
            return trauma.accident;
        default:
            return 0;
    }
}

export function addTrauma(trauma: number, amount: number): number {
    return Math.min(1, Math.max(0, trauma + amount));
}

export function decayTrauma(trauma: number, dt: number): number {
    return Math.max(0, trauma - EFFECTS.shake.decayPerSecond * Math.max(0, dt));
}

/** Two sines at unrelated frequencies with weights adding up to 1, so the wobble stays within [-1, 1]. */
function wobble(t: number, ratio: number, phase: number): number {
    const f = 2 * Math.PI * EFFECTS.shake.frequencyHz;
    return 0.6 * Math.sin(f * ratio * t + phase) + 0.4 * Math.sin(f * ratio * 1.618 * t + phase * 2.3);
}

/** The camera offset for `trauma` at `t` seconds, in metres; at most `maxOffsetMetres * trauma^2` on each axis. */
export function shakeOffset(trauma: number, t: number): { x: number; y: number; z: number } {
    const amplitude = EFFECTS.shake.maxOffsetMetres * trauma * trauma;
    if (amplitude === 0) {
        return { x: 0, y: 0, z: 0 };
    }
    return {
        x: amplitude * wobble(t, 1, 0.3),
        y: amplitude * 0.6 * wobble(t, 0.87, 1.7),
        z: amplitude * wobble(t, 1.13, 4.1)
    };
}
