import { describe, expect, it } from 'vitest';

import { CITY, KIOSKS, WEIGHT } from '../../config/tuning';

import { generateCity } from './generate';
import type { City, Rect, Road } from './types';
import { ZONE, ZONE_OF_CLASS } from './types';

const SEEDS = Array.from({ length: 24 }, (_, i) => i * 7919 + 1);
const cities = new Map<number, City>();
const cityFor = (seed: number): City => {
    let city = cities.get(seed);
    if (!city) {
        city = generateCity(seed);
        cities.set(seed, city);
    }
    return city;
};

const SLIM_DIAMETER = WEIGHT.diameter.baseMetres;
const MAX_DIAMETER = WEIGHT.diameter.baseMetres + WEIGHT.diameter.gainMetres;
const widthOf = (road: Road) => CITY.streetClasses[road.streetClass].widthMetres;
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const touches = (a: Rect, b: Rect) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;

/**
 * Cells on the centre line of a road, excluding its two end cells. Major roads run from border to border through the
 * perimeter ring, so their ends inside the ring are left out too.
 */
function centreLine(road: Road): { x: number; z: number }[] {
    const trim =
        road.streetClass === 'avenue' || road.streetClass === 'boulevard' ? CITY.streetClasses.avenue.widthMetres : 1;
    const cells: { x: number; z: number }[] = [];
    for (let t = road.from + trim; t <= road.to - trim; t++) {
        cells.push(road.axis === 'x' ? { x: t, z: road.centre } : { x: road.centre, z: t });
    }
    return cells;
}

describe.each(SEEDS)('city %i', (seed) => {
    const city = cityFor(seed);
    const { nav } = city;

    it('gives every cell a zone and blocks the city border', () => {
        expect(nav.zone.includes(ZONE.unassigned)).toBe(false);
        expect(nav.zoneAt(-city.halfSize, 0)).toBe(ZONE.blocked);
        expect(nav.zoneAt(city.halfSize, 17)).toBe(ZONE.blocked);
        expect(nav.zoneAt(3, -city.halfSize)).toBe(ZONE.blocked);
        expect(nav.zoneAt(-21, city.halfSize)).toBe(ZONE.blocked);
    });

    it('has a perimeter ring and one or two boulevards in each direction', () => {
        for (const axis of ['x', 'z'] as const) {
            const majors = city.roads.filter((r) => r.axis === axis && r.streetClass !== 'street');
            const boulevards = majors.filter((r) => r.streetClass === 'boulevard').length;
            expect(boulevards).toBeGreaterThanOrEqual(CITY.boulevardsPerAxis.min);
            expect(boulevards).toBeLessThanOrEqual(CITY.boulevardsPerAxis.max);
            for (const m of majors) {
                expect(m.from).toBe(-city.halfSize);
                expect(m.to).toBe(city.halfSize);
            }
            const centres = majors.map((m) => m.centre);
            expect(Math.min(...centres)).toBe(-city.halfSize + CITY.streetClasses.avenue.widthMetres / 2);
            expect(Math.max(...centres)).toBe(city.halfSize - CITY.streetClasses.avenue.widthMetres / 2);
        }
    });

    it('joins both ends of every street to an avenue or a boulevard', () => {
        const majors = city.roads.filter((r) => r.streetClass !== 'street');
        for (const street of city.roads.filter((r) => r.streetClass === 'street')) {
            for (const end of [street.from, street.to]) {
                const joined = majors.some(
                    (m) =>
                        m.axis !== street.axis &&
                        (end === m.centre - widthOf(m) / 2 || end === m.centre + widthOf(m) / 2) &&
                        street.centre > m.from &&
                        street.centre < m.to
                );
                expect(joined, `street ${street.id} end ${end}`).toBe(true);
            }
        }
    });

    it('opens both ends of every alley onto a wider road', () => {
        expect(city.alleys.length).toBeGreaterThan(0);
        for (const alley of city.alleys) {
            for (const end of [alley.from - 1, alley.to + 1]) {
                const point = alley.axis === 'x' ? { x: end, z: alley.centre } : { x: alley.centre, z: end };
                const zone = nav.zoneAt(point.x, point.z);
                expect([ZONE.street, ZONE.avenue, ZONE.boulevard], `alley ${alley.id}`).toContain(zone);
            }
        }
    });

    it('keeps every alley exactly as wide as its class', () => {
        for (const alley of city.alleys) {
            for (const p of centreLine(alley)) {
                expect(nav.clearanceAt(p.x, p.z), `alley ${alley.id} at ${p.x},${p.z}`).toBe(widthOf(alley) / 2);
            }
        }
    });

    it('never makes a road narrower than its class, and narrows it to exactly its class somewhere', () => {
        for (const road of city.roads) {
            const clearances = centreLine(road).map((p) => nav.clearanceAt(p.x, p.z));
            expect(Math.min(...clearances), `road ${road.id}`).toBeGreaterThanOrEqual(widthOf(road) / 2);
            const beside = (r: Rect) => touches(r, road.rect);
            if (!beside(city.plaza.rect) && !beside(city.park.rect)) {
                expect(Math.min(...clearances), `road ${road.id}`).toBe(widthOf(road) / 2);
            }
        }
    });

    it('lets a slim Benny reach every walkable cell from the spawn point', () => {
        expect(nav.canStand(city.spawn.x, city.spawn.z, SLIM_DIAMETER)).toBe(true);
        expect(nav.zoneAt(city.spawn.x, city.spawn.z)).toBe(ZONE.plaza);
        const distances = nav.pathDistances(city.spawn, SLIM_DIAMETER);
        const unreachable: string[] = [];
        for (let cell = 0; cell < nav.zone.length; cell++) {
            if (nav.zone[cell] !== ZONE.blocked && !Number.isFinite(distances[cell])) {
                unreachable.push(JSON.stringify(nav.centreOf(cell)));
            }
        }
        expect(unreachable).toEqual([]);
    });

    it('lets a Benny at maximum weight reach every avenue and boulevard cell he fits on', () => {
        const ring = city.roads.find((r) => r.streetClass === 'avenue' && r.from === -city.halfSize)!;
        const start = ring.axis === 'x' ? { x: 0, z: ring.centre } : { x: ring.centre, z: 0 };
        const distances = nav.pathDistances(start, MAX_DIAMETER);
        let fitting = 0;
        const unreachable: string[] = [];
        for (let cell = 0; cell < nav.zone.length; cell++) {
            const zone = nav.zone[cell];
            if ((zone === ZONE.avenue || zone === ZONE.boulevard) && nav.clearance[cell] > MAX_DIAMETER / 2) {
                fitting++;
                if (!Number.isFinite(distances[cell])) {
                    unreachable.push(JSON.stringify(nav.centreOf(cell)));
                }
            }
        }
        expect(fitting).toBeGreaterThan(1000);
        expect(unreachable).toEqual([]);
        // Every major road has room for him along its centre line
        for (const road of city.roads.filter((r) => r.streetClass !== 'street')) {
            const mid = road.axis === 'x' ? { x: 0, z: road.centre } : { x: road.centre, z: 0 };
            expect(nav.canStand(mid.x, mid.z, MAX_DIAMETER)).toBe(true);
        }
    });

    it('keeps a Benny at maximum weight out of streets and alleys', () => {
        const ring = city.roads.find((r) => r.streetClass === 'avenue' && r.from === -city.halfSize)!;
        const start = ring.axis === 'x' ? { x: 0, z: ring.centre } : { x: ring.centre, z: 0 };
        const distances = nav.pathDistances(start, MAX_DIAMETER);
        for (const road of [...city.roads.filter((r) => r.streetClass === 'street'), ...city.alleys]) {
            const beside = (r: Rect) => touches(r, road.rect);
            if (beside(city.plaza.rect) || beside(city.park.rect)) {
                continue;
            }
            // The middle of each road, away from the junctions, stays out of reach
            const reached = centreLine(road).filter((p) => {
                const fromEnds = Math.min(
                    Math.abs((road.axis === 'x' ? p.x : p.z) - road.from),
                    Math.abs((road.axis === 'x' ? p.x : p.z) - road.to)
                );
                return fromEnds > MAX_DIAMETER && Number.isFinite(distances[nav.cellAt(p.x, p.z)]);
            });
            expect(reached, `road ${road.id}`).toEqual([]);
        }
    });

    it('fills blocks with buildings that never overlap each other, a road or an open space', () => {
        // Count how many solids and open areas cover each 1 m square of the city
        const side = 2 * city.halfSize;
        const solid = new Uint8Array(side * side);
        const open = new Uint8Array(side * side);
        const cover = (grid: Uint8Array, r: Rect) => {
            for (let z = r.z0; z < r.z1; z++) {
                for (let x = r.x0; x < r.x1; x++) {
                    grid[(z + city.halfSize) * side + (x + city.halfSize)]++;
                }
            }
        };
        for (const b of city.buildings) {
            expect(Number.isInteger(b.rect.x0 + b.rect.x1 + b.rect.z0 + b.rect.z1)).toBe(true);
            expect(b.height).toBeGreaterThanOrEqual(CITY.buildingHeightMetres.min);
            cover(solid, b.rect);
        }
        for (const k of city.kioskSpots) {
            cover(solid, k.rect);
        }
        for (const r of [...city.roads, ...city.alleys]) {
            cover(open, r.rect);
        }
        cover(open, city.plaza.rect);
        cover(open, city.park.rect);
        let doubleSolid = 0;
        let solidOnOpen = 0;
        let uncovered = 0;
        for (let i = 0; i < solid.length; i++) {
            doubleSolid += solid[i] > 1 ? 1 : 0;
            solidOnOpen += solid[i] > 0 && open[i] > 0 ? 1 : 0;
            uncovered += solid[i] === 0 && open[i] === 0 ? 1 : 0;
        }
        expect({ doubleSolid, solidOnOpen, uncovered }).toEqual({ doubleSolid: 0, solidOnOpen: 0, uncovered: 0 });
        expect(city.buildings.some((b) => overlaps(b.rect, city.plaza.rect))).toBe(false);
    });

    it('has a central plaza with a fountain, a park with trees and one clock tower', () => {
        const centre = {
            x: (city.plaza.rect.x0 + city.plaza.rect.x1) / 2,
            z: (city.plaza.rect.z0 + city.plaza.rect.z1) / 2
        };
        expect(Math.hypot(centre.x, centre.z)).toBeLessThan(CITY.avenueSpacingMetres);
        expect(nav.zoneAt(city.plaza.fountain.x, city.plaza.fountain.z)).toBe(ZONE.blocked);
        expect(city.park.trees.length).toBeGreaterThan(0);
        expect(city.park.rect).not.toEqual(city.plaza.rect);
        const towers = city.buildings.filter((b) => b.landmark === 'clockTower');
        expect(towers).toHaveLength(1);
        expect(towers[0].height).toBe(CITY.clockTowerHeightMetres);
    });

    it('places the kiosks on streets and avenues, facing the road, spread across the city', () => {
        expect(city.kioskSpots).toHaveLength(KIOSKS.count);
        const slim = nav.pathDistances(city.spawn, SLIM_DIAMETER);
        for (const spot of city.kioskSpots) {
            expect(['street', 'avenue']).toContain(spot.roadClass);
            expect(Math.abs(spot.facing.x) + Math.abs(spot.facing.z)).toBe(1);
            const door = { x: (spot.doorZone.x0 + spot.doorZone.x1) / 2, z: (spot.doorZone.z0 + spot.doorZone.z1) / 2 };
            expect(nav.zoneAt(door.x + spot.facing.x, door.z + spot.facing.z)).toBe(ZONE_OF_CLASS[spot.roadClass]);
            expect(Number.isFinite(slim[nav.cellAt(door.x + spot.facing.x, door.z + spot.facing.z)])).toBe(true);
            const kiosk = { x: (spot.rect.x0 + spot.rect.x1) / 2, z: (spot.rect.z0 + spot.rect.z1) / 2 };
            expect(nav.zoneAt(kiosk.x, kiosk.z)).toBe(ZONE.blocked);
        }
        for (let i = 0; i < city.kioskSpots.length; i++) {
            for (let j = i + 1; j < city.kioskSpots.length; j++) {
                const a = city.kioskSpots[i].rect;
                const b = city.kioskSpots[j].rect;
                expect(Math.hypot(a.x0 - b.x0, a.z0 - b.z0)).toBeGreaterThan(40);
            }
        }
    });

    it('is bordered by the river on one or two sides and by parkland elsewhere', () => {
        expect(city.edges.map((e) => e.side).sort()).toEqual(['east', 'north', 'south', 'west']);
        const rivers = city.edges.filter((e) => e.kind === 'river').length;
        expect(rivers).toBeGreaterThanOrEqual(CITY.riverSides.min);
        expect(rivers).toBeLessThanOrEqual(CITY.riverSides.max);
    });
});

describe('generateCity', () => {
    it('is deterministic per seed', () => {
        const a = generateCity(1234);
        const b = generateCity(1234);
        const { nav: navA, ...restA } = a;
        const { nav: navB, ...restB } = b;
        expect(restA).toEqual(restB);
        expect(navA.zone).toEqual(navB.zone);
        expect(navA.clearance).toEqual(navB.clearance);
    });

    it('gives different cities for different seeds', () => {
        const layouts = new Set(SEEDS.map((s) => JSON.stringify(cityFor(s).roads)));
        expect(layouts.size).toBe(SEEDS.length);
    });
});
