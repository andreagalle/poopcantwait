import { POPUP_TOILETS } from '../../config/tuning';
import type { NavGrid } from '../city/navgrid';
import type { Point } from '../city/types';
import { clampWeight } from '../player/weight';
import type { Rng } from '../rng';

/** A portable toilet that popped out of the ground (design: *Pop-up toilets*). Always free; gone once used. */
export interface PopupToilet {
    readonly id: number;
    readonly x: number;
    readonly z: number;
    /** Seconds before it sinks back into the ground. */
    readonly secondsLeft: number;
}

/** Seconds between two pop-ups: 25 s for a slim Benny down to 6 s at maximum weight (initial tuning). */
export function popupIntervalAt(w: number): number {
    const { atZeroWeight, atMaxWeight } = POPUP_TOILETS.spawnIntervalSeconds;
    return atZeroWeight + (atMaxWeight - atZeroWeight) * clampWeight(w);
}

/**
 * A spot for a pop-up: a cell Benny reaches at his girth, at a path distance between `min` and `max` metres, with room
 * for him and the cabin. Picked at random among all such cells; `null` when there is none.
 */
export function choosePopupSpot(
    nav: NavGrid,
    distances: Float64Array,
    diameter: number,
    min: number,
    max: number,
    rng: Rng
): Point | null {
    const room = Math.max(diameter / 2, POPUP_TOILETS.footprintMetres / 2) + 0.5;
    const candidates: number[] = [];
    for (let cell = 0; cell < distances.length; cell++) {
        const d = distances[cell];
        if (d >= min && d <= max && nav.clearance[cell] > room) {
            candidates.push(cell);
        }
    }
    return candidates.length > 0 ? nav.centreOf(rng.pick(candidates)) : null;
}

/** Whether Benny's circle reaches a pop-up cabin closely enough to use it. */
export function touchesPopup(x: number, z: number, radius: number, popup: PopupToilet, reach: number): boolean {
    return Math.hypot(x - popup.x, z - popup.z) <= radius + POPUP_TOILETS.footprintMetres / 2 + reach;
}
