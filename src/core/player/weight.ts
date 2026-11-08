import { BENNY, WEIGHT } from '../../config/tuning';

/**
 * The weight model (design: *Weight, girth and speed*). Weight `w` goes from 0 (slim) to 1 (maximum); every function
 * clamps it to that range.
 */

export type GirthTier = (typeof WEIGHT.tiers)[number]['name'];

export const clampWeight = (w: number): number => Math.min(1, Math.max(0, w));

/** Diameter of Benny's collision circle, in metres: `0.9 + 6.6 * w^1.3` with the initial tuning. */
export function diameterAt(w: number): number {
    const { baseMetres, gainMetres, exponent } = WEIGHT.diameter;
    return baseMetres + gainMetres * Math.pow(clampWeight(w), exponent);
}

/** Top running speed, in m/s: `7 * (1 - 0.7 * w^0.8)` with the initial tuning. */
export function topSpeedAt(w: number): number {
    const { baseMetresPerSecond, slowdown, exponent } = WEIGHT.topSpeed;
    return baseMetresPerSecond * (1 - slowdown * Math.pow(clampWeight(w), exponent));
}

/** Factor on acceleration and braking: a heavy Benny takes time to start and to stop. */
export function accelerationScaleAt(w: number): number {
    return 1 - WEIGHT.acceleration.weightPenalty * clampWeight(w);
}

/** The girth tier shown in the HUD. */
export function girthTierAt(w: number): GirthTier {
    const weight = clampWeight(w);
    return (WEIGHT.tiers.find((tier) => weight <= tier.maxWeight) ?? WEIGHT.tiers[WEIGHT.tiers.length - 1]).name;
}

/** Visual height factor: the model grows taller with weight, up to `BENNY.maxHeightScale` at `w = 1`. */
export function heightScaleAt(w: number): number {
    return 1 + (BENNY.maxHeightScale - 1) * clampWeight(w);
}
