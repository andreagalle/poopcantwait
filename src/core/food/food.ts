import { FOOD } from '../../config/tuning';
import type { JunkFoodId, VegetableId } from '../../config/tuning';
import type { NavGrid } from '../city/navgrid';
import type { Point } from '../city/types';
import { ZONE } from '../city/types';
import type { Rng } from '../rng';

/** Food on the street (design: *Food*): junk food scores and fattens, vegetables shorten the countdown. */
export type FoodKind =
    | { readonly category: 'junk'; readonly id: JunkFoodId }
    | { readonly category: 'vegetable'; readonly id: VegetableId };

export interface FoodItem {
    readonly id: number;
    readonly kind: FoodKind;
    readonly x: number;
    readonly z: number;
    /** Seconds before it fades out. */
    readonly secondsLeft: number;
}

const JUNK = Object.keys(FOOD.junk) as JunkFoodId[];
const VEGETABLES = Object.keys(FOOD.vegetables) as VegetableId[];

/** Radius of an item for eating, in metres: Benny eats it by touching it. */
export const ITEM_RADIUS = FOOD.itemSizeMetres / 2;

/** Share of spawns that are vegetables after `elapsedSeconds`: 20% at the start, rising linearly to 40% at 8 min. */
export function vegetableShareAt(elapsedSeconds: number): number {
    const { start, end, rampSeconds } = FOOD.vegetableShare;
    const t = Math.min(1, Math.max(0, elapsedSeconds / rampSeconds));
    return start + (end - start) * t;
}

/** Draws the kind of the next item: a vegetable with the share of the moment, otherwise junk food, uniformly. */
export function chooseKind(rng: Rng, elapsedSeconds: number): FoodKind {
    return rng.chance(vegetableShareAt(elapsedSeconds))
        ? { category: 'vegetable', id: rng.pick(VEGETABLES) }
        : { category: 'junk', id: rng.pick(JUNK) };
}

/**
 * A spot for a new item: walkable ground (alleys included, where only a slim Benny goes) at a straight-line distance
 * from Benny within the spawn band, clear of walls and of other items. Tries a few random spots; `null` if none fits.
 */
export function chooseFoodSpot(nav: NavGrid, near: Point, others: readonly Point[], rng: Rng): Point | null {
    const { min, max } = FOOD.spawnDistanceMetres;
    for (let attempt = 0; attempt < 24; attempt++) {
        const angle = rng.range(0, 2 * Math.PI);
        const distance = Math.sqrt(rng.range(min * min, max * max));
        const x = Math.round(near.x + distance * Math.cos(angle));
        const z = Math.round(near.z + distance * Math.sin(angle));
        const zone = nav.zoneAt(x, z);
        if (zone === ZONE.blocked || nav.clearanceAt(x, z) <= ITEM_RADIUS) {
            continue;
        }
        if (others.some((o) => Math.hypot(o.x - x, o.z - z) < FOOD.itemSizeMetres * 2)) {
            continue;
        }
        return { x, z };
    }
    return null;
}

/** Whether Benny's circle touches an item. */
export function touchesFood(x: number, z: number, radius: number, item: FoodItem): boolean {
    return Math.hypot(x - item.x, z - item.z) <= radius + ITEM_RADIUS;
}
