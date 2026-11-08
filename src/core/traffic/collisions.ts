import { COLLISIONS } from '../../config/tuning';
import { clampWeight } from '../player/weight';

import type { VehicleType } from './vehicles';

/**
 * Benny against vehicles (design: *Collisions*): below the vehicle's crumple threshold it knocks him back and stuns
 * him, both less the fatter he is; at or above it, the vehicle crumples against his belly.
 */
export type HitOutcome =
    | { readonly kind: 'knocked'; readonly distance: number; readonly stunSeconds: number }
    | { readonly kind: 'crumple' };

export function hitOutcome(type: VehicleType, weight: number): HitOutcome {
    const threshold = COLLISIONS.crumpleWeightThreshold[type];
    const w = clampWeight(weight);
    if (w >= threshold) {
        return { kind: 'crumple' };
    }
    const share = 1 - w / threshold;
    return {
        kind: 'knocked',
        distance: COLLISIONS.knockBackMaxMetres * share,
        stunSeconds: Math.max(COLLISIONS.stunSeconds.min, COLLISIONS.stunSeconds.max * share)
    };
}

/**
 * The speed that carries Benny `distance` metres before braking stops him, at a braking rate in m/s²: the knock-back
 * is an impulse that ordinary braking soaks up, so walls stop him the usual way.
 */
export function knockSpeed(distance: number, brakingRate: number): number {
    return Math.sqrt(2 * brakingRate * Math.max(0, distance));
}
