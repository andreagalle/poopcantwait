import { KIOSKS, POPUP_TOILETS } from '../../config/tuning';
import type { NavGrid } from '../city/navgrid';
import { ZONE } from '../city/types';
import type { Building, Point, Zone } from '../city/types';
import { clampWeight } from '../player/weight';
import type { Rng } from '../rng';

/** A portable toilet that popped out of the ground (design: *Pop-up toilets*). Always free; gone once used. */
export interface PopupToilet {
    readonly id: number;
    readonly x: number;
    readonly z: number;
    /** Which way its door faces: away from the building it backs onto, along an axis. */
    readonly facing: Point;
    /** Seconds before it sinks back into the ground. */
    readonly secondsLeft: number;
}

/** Where a pop-up goes: its centre, and the way its door faces. */
export interface PopupSpot extends Point {
    readonly facing: Point;
}

/**
 * Ground a pop-up may stand on: the sidewalks of avenues and boulevards, which leave room beside their lanes, and the
 * plaza and the park, should a building border them. Never a street, where cars drive within a metre or two of the
 * facades and would go through the cabin, nor an alley, which it would block (and where Benny could not stand at its
 * door anyway).
 */
function openForCabin(zone: Zone): boolean {
    return zone === ZONE.avenue || zone === ZONE.boulevard || zone === ZONE.plaza || zone === ZONE.park;
}

/** Seconds between two pop-ups: 25 s for a slim Benny down to 6 s at maximum weight (initial tuning). */
export function popupIntervalAt(w: number): number {
    const { atZeroWeight, atMaxWeight } = POPUP_TOILETS.spawnIntervalSeconds;
    return atZeroWeight + (atMaxWeight - atZeroWeight) * clampWeight(w);
}

/**
 * Where Benny's centre stands when he steps into a pop-up through its door: out from the cabin by its half side, his
 * radius and the door reach, as at a kiosk. The toilet indicators measure the way to this point.
 */
export function popupDoor(popup: PopupSpot, radius: number): Point {
    const out = POPUP_TOILETS.footprintMetres / 2 + radius + KIOSKS.doorReachMetres;
    return { x: popup.x + popup.facing.x * out, z: popup.z + popup.facing.z * out };
}

/**
 * Every spot of the city where a pop-up may appear (design: *Pop-up toilets*): against a building, one per metre of
 * facade, its door facing away from it, on open ground where no car passes. Computed once per city; which of them Benny
 * can use depends on his girth and where he is (`choosePopupSpot`).
 */
export function wallSpots(nav: NavGrid, buildings: readonly Building[]): PopupSpot[] {
    const footprint = POPUP_TOILETS.footprintMetres;
    const half = footprint / 2;
    const spots: PopupSpot[] = [];
    // The cabin's ground, sampled near its four corners: the first row out from the facade skips the cells on the
    // building's edge, which the grid counts as the building's own
    const depths = [0.55, footprint - 0.05];
    const sides = [-(half - 0.25), half - 0.25];
    const tryAt = (fx: number, fz: number, facing: Point): void => {
        for (const depth of depths) {
            for (const side of sides) {
                const x = fx + facing.x * depth + facing.z * side;
                const z = fz + facing.z * depth + facing.x * side;
                if (!openForCabin(nav.zoneAt(x, z))) {
                    return;
                }
            }
        }
        spots.push({ x: fx + facing.x * half, z: fz + facing.z * half, facing });
    };
    for (const { rect } of buildings) {
        // Along each side, one metre apart, never past the building's corners
        for (let along = rect.x0 + half; along <= rect.x1 - half; along++) {
            tryAt(along, rect.z0, { x: 0, z: -1 });
            tryAt(along, rect.z1, { x: 0, z: 1 });
        }
        for (let along = rect.z0 + half; along <= rect.z1 - half; along++) {
            tryAt(rect.x0, along, { x: -1, z: 0 });
            tryAt(rect.x1, along, { x: 1, z: 0 });
        }
    }
    return spots;
}

/**
 * A spot for a pop-up, out of the city's `spots` (`wallSpots`): its door where Benny stands at his girth, between `min`
 * and `max` metres of walking from him (`distances`), and clear of the cabins already up (`taken`). Picked at random
 * among them, or the nearest one when `nearest` is set; `null` when there is none.
 */
export function choosePopupSpot(
    nav: NavGrid,
    distances: Float64Array,
    spots: readonly PopupSpot[],
    taken: readonly Point[],
    diameter: number,
    band: { readonly min: number; readonly max: number; readonly nearest?: boolean },
    rng: Rng
): PopupSpot | null {
    const footprint = POPUP_TOILETS.footprintMetres;
    const fitting: PopupSpot[] = [];
    let best: { spot: PopupSpot; walk: number } | null = null;
    for (const spot of spots) {
        const door = popupDoor(spot, diameter / 2);
        const walk = distances[nav.cellAt(door.x, door.z)];
        if (!(walk >= band.min && walk <= band.max)) {
            continue;
        }
        if (taken.some((p) => Math.abs(p.x - spot.x) < footprint && Math.abs(p.z - spot.z) < footprint)) {
            continue;
        }
        fitting.push(spot);
        if (!best || walk < best.walk) {
            best = { spot, walk };
        }
    }
    if (band.nearest) {
        return best?.spot ?? null;
    }
    return fitting.length > 0 ? rng.pick(fitting) : null;
}

/** Whether Benny's circle reaches a pop-up cabin closely enough to use it. */
export function touchesPopup(x: number, z: number, radius: number, popup: PopupToilet, reach: number): boolean {
    return Math.hypot(x - popup.x, z - popup.z) <= radius + POPUP_TOILETS.footprintMetres / 2 + reach;
}
