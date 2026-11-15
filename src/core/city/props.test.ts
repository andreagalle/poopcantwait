import { describe, expect, it } from 'vitest';

import { CITY, TRAFFIC } from '../../config/tuning';
import { buildCollisionWorld } from '../player/collision';
import { diameterAt } from '../player/weight';

import { generateCity } from './generate';
import { isCircle } from './props';
import type { StreetProp } from './props';
import type { Rect, Road } from './types';
import { ZONE } from './types';

const inside = (x: number, z: number, r: Rect) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** The avenue or boulevard a prop stands on: the one whose footprint holds it. */
function roadOf(roads: readonly Road[], p: StreetProp): Road {
    return roads.find(
        (r) => (r.streetClass === 'avenue' || r.streetClass === 'boulevard') && inside(p.x, p.z, r.rect)
    )!;
}

/** How far a prop's solid reaches out from its facade, in metres. */
function reachOf(p: StreetProp, road: Road): number {
    const halfWidth = CITY.streetClasses[road.streetClass].widthMetres / 2;
    const across = road.axis === 'x' ? p.z : p.x;
    const fromFacade = halfWidth - Math.abs(across - road.centre);
    const s = p.solid;
    const halfDepth = isCircle(s) ? s.radius : road.axis === 'x' ? (s.z1 - s.z0) / 2 : (s.x1 - s.x0) / 2;
    return fromFacade + halfDepth;
}

describe('street props', () => {
    for (const seed of [5, 42]) {
        const city = generateCity(seed);

        it(`furnish the avenues and boulevards with every kind, seed ${seed}`, () => {
            const kinds = new Set(city.props.map((p) => p.kind));
            expect([...kinds].sort()).toEqual(['bench', 'hydrant', 'lamp', 'tree']);
            expect(city.props.length).toBeGreaterThan(100);
            // Trees only along boulevards, which are wide enough for their canopy
            for (const p of city.props.filter((q) => q.kind === 'tree')) {
                expect(roadOf(city.roads, p).streetClass).toBe('boulevard');
            }
        });

        it(`stand against a facade, facing the road, out of the lanes, seed ${seed}`, () => {
            for (const p of city.props) {
                const road = roadOf(city.roads, p);
                expect(road, JSON.stringify(p)).toBeDefined();
                // Right behind it, away from the way it faces, a building
                const back = { x: p.x - p.facing.x * 3, z: p.z - p.facing.z * 3 };
                expect(city.buildings.some((b) => inside(back.x, back.z, b.rect))).toBe(true);
                // The lane's buses keep clear: their side passes this far from the facade
                const halfWidth = CITY.streetClasses[road.streetClass].widthMetres / 2;
                const laneSide = halfWidth * (1 - 2 * TRAFFIC.laneOffsetShare) - TRAFFIC.size.bus.width / 2;
                expect(reachOf(p, road), JSON.stringify(p)).toBeLessThan(laneSide);
            }
        });

        it(`keep away from kiosks and leave a massive Benny room to pass, seed ${seed}`, () => {
            for (const p of city.props) {
                for (const k of city.kioskSpots) {
                    const dx = Math.max(k.doorZone.x0 - p.x, 0, p.x - k.doorZone.x1);
                    const dz = Math.max(k.doorZone.z0 - p.z, 0, p.z - k.doorZone.z1);
                    expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(CITY.streetProps.clearanceMetres);
                }
                // Out in the road from it, the widest Benny still fits
                const out = { x: p.x + p.facing.x * 5, z: p.z + p.facing.z * 5 };
                expect(city.nav.clearanceAt(out.x, out.z)).toBeGreaterThan(diameterAt(1) / 2);
            }
        });

        it(`are solid: on the navigation grid and in the collision world, seed ${seed}`, () => {
            const world = buildCollisionWorld(city);
            for (const p of city.props) {
                expect(city.nav.zoneAt(p.x, p.z)).toBe(ZONE.blocked);
                const solid = p.solid;
                if (isCircle(solid)) {
                    expect(world.circles).toContain(solid);
                } else {
                    expect(world.rects).toContain(solid);
                }
            }
        });
    }

    it('come out the same for the same seed', () => {
        expect(generateCity(9).props).toEqual(generateCity(9).props);
    });
});
