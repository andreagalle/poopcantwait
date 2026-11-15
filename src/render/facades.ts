import { Color } from 'playcanvas';

import { hashInts } from '../core/city/hash';
import type { NavGrid } from '../core/city/navgrid';
import type { Building } from '../core/city/types';
import { ZONE } from '../core/city/types';

import type { MeshBuilder } from './mesh-builder';

/**
 * The facade atlas (`texture.facade-atlas`): 4 by 4 tiles, read left to right from the top. The eight shops of the
 * town's sketches keep their own colours; the residential tiles have a white wall, tinted by each building's colour.
 */
const ATLAS_SIDE = 4;
export const SLOT = {
    shops: [0, 1, 2, 3, 4, 5, 6, 7],
    windowShutters: 8,
    windowOpen: 9,
    windowBalcony: 10,
    windowClosed: 11,
    frontDoor: 12,
    groundWindow: 13,
    plain: 14,
    roofTiles: 15
} as const;

/** A tile's facade size, in metres, roughly: each wall gets a whole number of them, stretched to fit. */
const BAY_METRES = 3;
const STOREY_METRES = 3;
/** The share of a tile left out at each of its edges, so the smaller mipmaps do not bleed into its neighbours. */
const INSET = 0.02;
/** Out of ten upper-floor windows, how many stand open, and how many more have a balcony. */
const OPEN_IN_TEN = 2;
const BALCONY_IN_TEN = 1;
/** Out of ten ground-floor bays on a road, beside the front door, how many are a flat's window instead of a shop. */
const GROUND_WINDOW_IN_TEN = 2;

const WHITE = new Color(1, 1, 1);

/**
 * A slot's corners in texture space, in the order of a wall's corners: bottom left, bottom right, top right, top left.
 * The texture's v runs down the image, as it was loaded: the slot's top edge has the smaller v.
 */
export function slotUv(slot: number): [[number, number], [number, number], [number, number], [number, number]] {
    const col = slot % ATLAS_SIDE;
    const row = Math.floor(slot / ATLAS_SIDE);
    const size = 1 / ATLAS_SIDE;
    const u0 = (col + INSET) * size;
    const u1 = (col + 1 - INSET) * size;
    const top = (row + INSET) * size;
    const bottom = (row + 1 - INSET) * size;
    return [
        [u0, bottom],
        [u1, bottom],
        [u1, top],
        [u0, top]
    ];
}

/** Where faces with no tile of their own (roofs, the clock tower) sample the atlas: the middle of the plain wall. */
export const PLAIN_WALL_UV: readonly [number, number] = (() => {
    const [[u0, v0], , [u1, v1]] = slotUv(SLOT.plain);
    return [(u0 + u1) / 2, (v0 + v1) / 2];
})();

const ROADS = new Set<number>([ZONE.street, ZONE.avenue, ZONE.boulevard, ZONE.plaza, ZONE.park]);

/**
 * A building in felt (design: *Art direction*): each wall cut into bays about 3 m wide and storeys about 3 m tall, a
 * tile per bay and storey. On a wall that faces a road the ground floor has the front door in its middle bay and shops
 * in the others, each bay its own trade (now and then a flat's window instead); every other ground floor has windows.
 * Upper floors keep one style of window per building, a few of them open or with a balcony, stacked bay over bay. The
 * roof is drawn apart (`addRoof`).
 */
export function addFacades(mesh: MeshBuilder, b: Building, index: number, nav: NavGrid, wall: Color): void {
    const r = b.rect;
    const h = b.height;
    const storeys = Math.max(1, Math.round(h / STOREY_METRES));
    const storey = h / storeys;
    const styles = [SLOT.windowShutters, SLOT.windowClosed, SLOT.windowShutters, SLOT.windowBalcony];
    const style = styles[hashInts(index, 1) % styles.length];
    // Each wall from outside, left to right: its bottom-left and bottom-right corners, and the way it faces
    const walls: { a: [number, number]; b: [number, number]; out: [number, number] }[] = [
        { a: [r.x0, r.z1], b: [r.x1, r.z1], out: [0, 1] },
        { a: [r.x1, r.z0], b: [r.x0, r.z0], out: [0, -1] },
        { a: [r.x1, r.z1], b: [r.x1, r.z0], out: [1, 0] },
        { a: [r.x0, r.z0], b: [r.x0, r.z1], out: [-1, 0] }
    ];
    walls.forEach(({ a, b: e, out }, side) => {
        const length = Math.hypot(e[0] - a[0], e[1] - a[1]);
        const bays = Math.max(1, Math.round(length / BAY_METRES));
        // The road it faces, looked for a little way out, past the street furniture standing by the facade
        const midX = (a[0] + e[0]) / 2;
        const midZ = (a[1] + e[1]) / 2;
        const onRoad = [2, 3].some((d) => ROADS.has(nav.zoneAt(midX + out[0] * d, midZ + out[1] * d)));
        const door = Math.floor(bays / 2);
        for (let bay = 0; bay < bays; bay++) {
            const s0 = bay / bays;
            const s1 = (bay + 1) / bays;
            const x0 = a[0] + (e[0] - a[0]) * s0;
            const z0 = a[1] + (e[1] - a[1]) * s0;
            const x1 = a[0] + (e[0] - a[0]) * s1;
            const z1 = a[1] + (e[1] - a[1]) * s1;
            for (let level = 0; level < storeys; level++) {
                let slot: number;
                if (level === 0 && onRoad) {
                    if (bay === door) {
                        slot = SLOT.frontDoor;
                    } else if (hashInts(index, side, bay, 2) % 10 < GROUND_WINDOW_IN_TEN) {
                        slot = SLOT.groundWindow;
                    } else {
                        // Neighbouring bays take the next trade along, from a start of its own for each wall
                        slot = SLOT.shops[(hashInts(index, side, 3) + bay) % SLOT.shops.length];
                    }
                } else if (level === 0) {
                    slot = SLOT.groundWindow;
                } else {
                    const roll = hashInts(index, side, bay, level, 4) % 10;
                    slot =
                        roll < OPEN_IN_TEN
                            ? SLOT.windowOpen
                            : roll < OPEN_IN_TEN + BALCONY_IN_TEN
                              ? SLOT.windowBalcony
                              : style;
                }
                const shop = (SLOT.shops as readonly number[]).includes(slot);
                const y0 = level * storey;
                const y1 = (level + 1) * storey;
                mesh.addFace(
                    [
                        [x0, y0, z0],
                        [x1, y0, z1],
                        [x1, y1, z1],
                        [x0, y1, z0]
                    ],
                    shop ? WHITE : wall,
                    slotUv(slot)
                );
            }
        }
    });
}
