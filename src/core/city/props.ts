import { CITY } from '../../config/tuning';
import type { StreetClass } from '../../config/tuning';

import type { Building, Circle, KioskSpot, Point, Rect, Road } from './types';
import { ZONE_OF_CLASS } from './types';

/** The kinds of street furniture (design: *Street props*). */
export type PropKind = 'tree' | 'lamp' | 'bench' | 'hydrant';

/** A piece of street furniture: solid, standing by a facade on the sidewalk of an avenue or a boulevard. */
export interface StreetProp {
    readonly kind: PropKind;
    readonly x: number;
    readonly z: number;
    /** Unit vector along an axis, away from the facade it stands by: the way a bench's seat faces. */
    readonly facing: Point;
    /** What Benny collides with: a circle, or a rectangle for a bench. */
    readonly solid: Circle | Rect;
}

/** Whether a solid is a circle (a rectangle otherwise). */
export const isCircle = (solid: Circle | Rect): solid is Circle => 'radius' in solid;

/** The roads that get furniture, and how: the spacing along each side and what stands at each spot, in turn. */
function layoutOf(streetClass: StreetClass): { spacing: number; pattern: readonly (PropKind | null)[] } | null {
    const { spacingMetres, pattern } = CITY.streetProps;
    if (streetClass === 'avenue' || streetClass === 'boulevard') {
        return { spacing: spacingMetres[streetClass], pattern: pattern[streetClass] };
    }
    return null;
}

/** The solid of a piece of furniture standing `offset` metres out from a facade, at a point, facing away from it. */
function solidOf(kind: PropKind, x: number, z: number, facing: Point): Circle | Rect {
    if (kind !== 'bench') {
        return { x, z, radius: CITY.streetProps.kinds[kind].radiusMetres };
    }
    const { lengthMetres, depthMetres } = CITY.streetProps.kinds.bench;
    const halfAcross = facing.x !== 0 ? depthMetres / 2 : lengthMetres / 2;
    const halfAlong = facing.z !== 0 ? depthMetres / 2 : lengthMetres / 2;
    return { x0: x - halfAcross, z0: z - halfAlong, x1: x + halfAcross, z1: z + halfAlong };
}

/** Distance from a point to a rectangle, 0 inside it. */
function distanceToRect(p: Point, r: Rect): number {
    const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1);
    const dz = Math.max(r.z0 - p.z, 0, p.z - r.z1);
    return Math.hypot(dx, dz);
}

/**
 * The street furniture of a city (design: *Street props*): along both sides of every avenue and boulevard, one spot
 * every `spacingMetres`, against a continuous facade, never at a crossing, an alley mouth or a kiosk, and clear of the
 * lanes, so no vehicle runs into it and no Benny who fits the road is kept out of it. Deterministic: it draws no random
 * numbers, so the rest of a seeded city stays the same. `zone` holds the roads, buildings and kiosks already painted.
 */
export function placeStreetProps(
    roads: readonly Road[],
    buildings: readonly Building[],
    kioskSpots: readonly KioskSpot[],
    zone: Uint8Array,
    half: number
): StreetProp[] {
    const size = 2 * half + 1;
    const inBuilding = new Uint8Array(size * size);
    for (const { rect } of buildings) {
        for (let z = Math.ceil(rect.z0); z <= Math.floor(rect.z1); z++) {
            for (let x = Math.ceil(rect.x0); x <= Math.floor(rect.x1); x++) {
                inBuilding[(z + half) * size + x + half] = 1;
            }
        }
    }
    const cell = (x: number, z: number): number => {
        const col = Math.round(x) + half;
        const row = Math.round(z) + half;
        return col < 0 || row < 0 || col >= size || row >= size ? -1 : row * size + col;
    };
    const { clearanceMetres, kinds } = CITY.streetProps;
    const props: StreetProp[] = [];
    for (const road of roads) {
        const layout = layoutOf(road.streetClass);
        if (!layout) {
            continue;
        }
        const roadZone = ZONE_OF_CLASS[road.streetClass];
        const halfWidth = CITY.streetClasses[road.streetClass].widthMetres / 2;
        for (const side of [-1, 1]) {
            const facade = road.centre + side * halfWidth;
            // Away from the facade, towards the middle of the road
            const facing = road.axis === 'x' ? { x: 0, z: -side } : { x: -side, z: 0 };
            const at = (along: number, out: number): Point =>
                road.axis === 'x' ? { x: along, z: facade - side * out } : { x: facade - side * out, z: along };
            // The far side starts half way through the pattern, so the two sides do not mirror each other
            let index = side === 1 ? 0 : Math.floor(layout.pattern.length / 2);
            for (
                let along = road.from + layout.spacing / 2;
                along <= road.to - layout.spacing / 2;
                along += layout.spacing
            ) {
                const kind = layout.pattern[index % layout.pattern.length];
                index++;
                if (!kind) {
                    continue;
                }
                const a = Math.round(along);
                const p = at(a, kinds[kind].offsetMetres);
                // A continuous facade behind and the same road in front, a crossing's width either way
                let clear = true;
                for (let d = -clearanceMetres; d <= clearanceMetres && clear; d++) {
                    const behind = cell(at(a + d, -1).x, at(a + d, -1).z);
                    const front = cell(
                        at(a + d, kinds[kind].offsetMetres + 1).x,
                        at(a + d, kinds[kind].offsetMetres + 1).z
                    );
                    clear = behind >= 0 && inBuilding[behind] === 1 && front >= 0 && zone[front] === roadZone;
                }
                const here = cell(p.x, p.z);
                if (!clear || here < 0 || zone[here] !== roadZone) {
                    continue;
                }
                if (
                    kioskSpots.some(
                        (k) => Math.min(distanceToRect(p, k.rect), distanceToRect(p, k.doorZone)) < clearanceMetres
                    )
                ) {
                    continue;
                }
                props.push({ kind, x: p.x, z: p.z, facing, solid: solidOf(kind, p.x, p.z, facing) });
            }
        }
    }
    return props;
}
