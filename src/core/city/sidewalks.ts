import { CITY } from '../../config/tuning';
import type { StreetClass } from '../../config/tuning';

import type { City, Rect } from './types';
import { ZONE } from './types';

/** A strip of raised sidewalk, and the sides of it that drop to the road as a kerb. */
export interface Sidewalk {
    readonly rect: Rect;
}

const CLASS_OF_ZONE: Partial<Record<number, StreetClass>> = {
    [ZONE.street]: 'street',
    [ZONE.avenue]: 'avenue',
    [ZONE.boulevard]: 'boulevard'
};

/**
 * The raised sidewalks of a city (design: *Street props*, presentation only: Benny walks over them as over the road):
 * a strip along every side of a building, a kiosk, the plaza or the park that faces a street, an avenue or a boulevard,
 * as wide as that road class's sidewalk, and a square at each corner where two such strips meet. Alleys have none.
 * Each strip spans its side, so a row of buildings gives one continuous sidewalk, broken at crossings and alley mouths.
 */
export function sidewalksOf(city: City): Sidewalk[] {
    const nav = city.nav;
    const widths = CITY.sidewalkMetres;
    const outside = (x: number, z: number): number | null => {
        const zone = nav.zoneAt(x, z);
        const streetClass = CLASS_OF_ZONE[zone];
        return streetClass === undefined ? null : widths[streetClass];
    };
    const solids: Rect[] = [
        ...city.buildings.map((b) => b.rect),
        ...city.kioskSpots.map((k) => k.rect),
        city.plaza.rect,
        city.park.rect
    ];
    // The cells of every building and kiosk, as the navigation grid paints them: a side with one right outside it
    // backs onto a neighbour, not onto a road
    const solid = new Uint8Array(nav.size * nav.size);
    for (const r of solids.slice(0, solids.length - 2)) {
        for (let z = Math.ceil(r.z0); z <= Math.floor(r.z1); z++) {
            for (let x = Math.ceil(r.x0); x <= Math.floor(r.x1); x++) {
                const cell = nav.cellAt(x, z);
                if (cell >= 0) {
                    solid[cell] = 1;
                }
            }
        }
    }
    const against = (x: number, z: number): boolean => {
        const cell = nav.cellAt(x, z);
        return cell >= 0 && solid[cell] === 1;
    };
    const strips: Sidewalk[] = [];
    for (const r of solids) {
        const cx = (r.x0 + r.x1) / 2;
        const cz = (r.z0 + r.z1) / 2;
        // The road each side faces, looked for out from its middle past the street furniture standing by the facade
        // (a lamp or a bench takes the cells a metre out), and so the sidewalk's width (null: none)
        const out = (x: number, z: number, dx: number, dz: number): number | null =>
            against(x + 0.6 * dx, z + 0.6 * dz)
                ? null
                : (outside(x + 2 * dx, z + 2 * dz) ?? outside(x + 3 * dx, z + 3 * dz));
        const north = out(cx, r.z0, 0, -1);
        const south = out(cx, r.z1, 0, 1);
        const west = out(r.x0, cz, -1, 0);
        const east = out(r.x1, cz, 1, 0);
        if (north) strips.push({ rect: { x0: r.x0, z0: r.z0 - north, x1: r.x1, z1: r.z0 } });
        if (south) strips.push({ rect: { x0: r.x0, z0: r.z1, x1: r.x1, z1: r.z1 + south } });
        if (west) strips.push({ rect: { x0: r.x0 - west, z0: r.z0, x1: r.x0, z1: r.z1 } });
        if (east) strips.push({ rect: { x0: r.x1, z0: r.z0, x1: r.x1 + east, z1: r.z1 } });
        // The corners, where two sides with a sidewalk meet: only if the corner itself is open road
        const corner = (x: number, z: number, w: number | null, d: number | null, sx: number, sz: number): void => {
            if (w && d && outside(x + sx * 0.5, z + sz * 0.5) !== null) {
                const xs = [x, x + sx * w].sort((a, b) => a - b);
                const zs = [z, z + sz * d].sort((a, b) => a - b);
                strips.push({ rect: { x0: xs[0], z0: zs[0], x1: xs[1], z1: zs[1] } });
            }
        };
        corner(r.x0, r.z0, west, north, -1, -1);
        corner(r.x1, r.z0, east, north, 1, -1);
        corner(r.x0, r.z1, west, south, -1, 1);
        corner(r.x1, r.z1, east, south, 1, 1);
    }
    return strips;
}
