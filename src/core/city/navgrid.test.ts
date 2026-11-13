import { describe, expect, it } from 'vitest';

import { Rng } from '../rng';

import { distanceTransform } from './edt';
import { NavGrid, PathSearch } from './navgrid';
import { ZONE } from './types';

/** A walkable square grid of `2 * half + 1` cells per side, walled on its border. */
function walledGrid(half: number): Uint8Array {
    const size = 2 * half + 1;
    const zone = new Uint8Array(size * size).fill(ZONE.street);
    for (let i = 0; i < size; i++) {
        zone[i] = ZONE.blocked;
        zone[(size - 1) * size + i] = ZONE.blocked;
        zone[i * size] = ZONE.blocked;
        zone[i * size + size - 1] = ZONE.blocked;
    }
    return zone;
}

function block(zone: Uint8Array, half: number, x0: number, z0: number, x1: number, z1: number): void {
    const size = 2 * half + 1;
    for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
            zone[(z + half) * size + (x + half)] = ZONE.blocked;
        }
    }
}

describe('distanceTransform', () => {
    it('matches a brute-force search on random grids', () => {
        const rng = new Rng(4);
        for (let trial = 0; trial < 20; trial++) {
            const width = rng.int(1, 24);
            const height = rng.int(1, 24);
            const obstacles = new Uint8Array(width * height).map(() => (rng.chance(0.1) ? 1 : 0));
            const result = distanceTransform(obstacles, width, height);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let best = Infinity;
                    for (let oy = 0; oy < height; oy++) {
                        for (let ox = 0; ox < width; ox++) {
                            if (obstacles[oy * width + ox]) {
                                best = Math.min(best, Math.hypot(ox - x, oy - y));
                            }
                        }
                    }
                    expect(result[y * width + x]).toBeCloseTo(best, 4);
                }
            }
        }
    });

    it('gives Infinity everywhere without obstacles', () => {
        expect([...distanceTransform(new Uint8Array(6), 3, 2)]).toEqual(new Array(6).fill(Infinity));
    });

    it('rejects a grid of the wrong size', () => {
        expect(() => distanceTransform(new Uint8Array(5), 3, 2)).toThrow(RangeError);
    });
});

describe('NavGrid', () => {
    it('measures the exact half-width in the middle of a corridor', () => {
        // A 6 m wide corridor between walls at z = -3 and z = 3
        const half = 10;
        const zone = walledGrid(half);
        block(zone, half, -10, -10, 10, -3);
        block(zone, half, -10, 3, 10, 10);
        const nav = new NavGrid(half, zone);
        expect(nav.clearanceAt(0, 0)).toBe(3);
        expect(nav.clearanceAt(0, 2)).toBe(1);
        expect(nav.canStand(0, 0, 5.9)).toBe(true);
        expect(nav.canStand(0, 0, 6)).toBe(false);
        expect(nav.zoneAt(0, 0)).toBe(ZONE.street);
        expect(nav.zoneAt(0, 5)).toBe(ZONE.blocked);
    });

    it('maps world points to cells and back', () => {
        const nav = new NavGrid(5, walledGrid(5));
        expect(nav.size).toBe(11);
        const cell = nav.cellAt(-2.4, 3.6);
        expect(nav.centreOf(cell)).toEqual({ x: -2, z: 4 });
        expect(nav.cellAt(6, 0)).toBe(-1);
        expect(nav.cellAt(0, -5.6)).toBe(-1);
        expect(nav.clearanceAt(100, 0)).toBe(0);
        expect(nav.zoneAt(100, 0)).toBe(ZONE.blocked);
        expect(nav.pathDistance({ x: 0, z: 0 }, { x: 100, z: 0 }, 1)).toBe(Infinity);
    });

    it('measures straight and diagonal path distances', () => {
        const nav = new NavGrid(10, walledGrid(10));
        expect(nav.pathDistance({ x: -5, z: 0 }, { x: 5, z: 0 }, 0.9)).toBeCloseTo(10, 5);
        expect(nav.pathDistance({ x: -5, z: -5 }, { x: 5, z: 5 }, 0.9)).toBeCloseTo(10 * Math.SQRT2, 5);
        expect(nav.pathDistance({ x: -5, z: -5 }, { x: 5, z: 0 }, 0.9)).toBeCloseTo(5 + 5 * Math.SQRT2, 5);
    });

    it('walks around walls and finds nothing past a closed wall', () => {
        const half = 10;
        const zone = walledGrid(half);
        // A wall at x = 0 from the north edge down to z = 5, leaving a gap at the south
        block(zone, half, 0, -10, 0, 5);
        const nav = new NavGrid(half, zone);
        const around = nav.pathDistance({ x: -3, z: 0 }, { x: 3, z: 0 }, 0.9);
        expect(around).toBeGreaterThan(6);
        expect(Number.isFinite(around)).toBe(true);

        block(zone, half, 0, 6, 0, 10);
        const closed = new NavGrid(half, zone);
        expect(closed.pathDistance({ x: -3, z: 0 }, { x: 3, z: 0 }, 0.9)).toBe(Infinity);
    });

    it('lets a slim Benny through a gap that stops a wide one', () => {
        const half = 12;
        const zone = walledGrid(half);
        // A wall across the grid at x = 0 with a 2 m alley (z from -1 to 1 open)
        block(zone, half, 0, -12, 0, -1);
        block(zone, half, 0, 1, 0, 12);
        block(zone, half, -1, -12, 1, -1);
        block(zone, half, -1, 1, 1, 12);
        const nav = new NavGrid(half, zone);
        expect(nav.clearanceAt(0, 0)).toBe(1);
        const from = { x: -6, z: 0 };
        const to = { x: 6, z: 0 };
        expect(nav.pathDistance(from, to, 1.9)).toBeCloseTo(12, 5);
        expect(nav.pathDistance(from, to, 2)).toBe(Infinity);
    });

    it('returns no distances when Benny does not fit where he stands', () => {
        const nav = new NavGrid(4, walledGrid(4));
        const distances = nav.pathDistances({ x: 0, z: 0 }, 20);
        expect(distances.every((d) => d === Infinity)).toBe(true);
    });

    it('stops expanding beyond the maximum distance', () => {
        const nav = new NavGrid(30, walledGrid(30));
        const distances = nav.pathDistances({ x: 0, z: 0 }, 0.9, 5);
        expect(distances[nav.cellAt(4, 0)]).toBeCloseTo(4, 5);
        expect(distances[nav.cellAt(10, 0)]).toBe(Infinity);
    });

    it('reuses an output array, with the same distances as a fresh one', () => {
        const half = 40;
        const zone = walledGrid(half);
        block(zone, half, -10, -20, 10, 5);
        const nav = new NavGrid(half, zone);
        const fresh = nav.pathDistances({ x: -20, z: 0 }, 0.9);
        // Fill the array with another search first: nothing of it may leak into the next one
        const out = nav.pathDistances({ x: 25, z: 25 }, 2.5, 12);
        const reused = nav.pathDistances({ x: -20, z: 0 }, 0.9, Infinity, out);
        expect(reused).toBe(out);
        expect(Array.from(reused)).toEqual(Array.from(fresh));
        // An array of the wrong size is not used
        const wrong = new Float64Array(10);
        expect(nav.pathDistances({ x: -20, z: 0 }, 0.9, Infinity, wrong)).not.toBe(wrong);
    });

    it('gives the same answers when the search runs again on the same grid (its queue is reused)', () => {
        const nav = new NavGrid(30, walledGrid(30));
        const first = Array.from(nav.pathDistances({ x: 3, z: -7 }, 0.9));
        nav.pathDistances({ x: -20, z: 20 }, 0.9, 8);
        expect(Array.from(nav.pathDistances({ x: 3, z: -7 }, 0.9))).toEqual(first);
    });

    it('grows its queue past the initial capacity', () => {
        // A 121 by 121 open grid pushes far more than 1024 cells
        const nav = new NavGrid(60, walledGrid(60));
        const distances = nav.pathDistances({ x: 0, z: 0 }, 0.9);
        expect(distances[nav.cellAt(55, 55)]).toBeCloseTo(55 * Math.SQRT2, 4);
    });

    it('rejects malformed grids', () => {
        expect(() => new NavGrid(0, new Uint8Array(1))).toThrow(RangeError);
        expect(() => new NavGrid(1.5, new Uint8Array(16))).toThrow(RangeError);
        expect(() => new NavGrid(2, new Uint8Array(24))).toThrow(RangeError);
    });

    it('treats unassigned cells as blocked', () => {
        const zone = walledGrid(3);
        zone[3 * 7 + 3] = ZONE.unassigned;
        expect(new NavGrid(3, zone).clearanceAt(0, 0)).toBe(0);
    });
});

describe('PathSearch', () => {
    /** A walled grid with a few random blocks, so the paths bend. */
    function city(seed: number): NavGrid {
        const half = 30;
        const zone = walledGrid(half);
        const rng = new Rng(seed);
        for (let i = 0; i < 25; i++) {
            const x = rng.int(-25, 22);
            const z = rng.int(-25, 22);
            block(zone, half, x, z, x + rng.int(0, 4), z + rng.int(0, 4));
        }
        return new NavGrid(half, zone);
    }

    it('finds the same distances in slices as in one go, whatever the slice', () => {
        for (const seed of [1, 2, 3]) {
            const nav = city(seed);
            const from = { x: 27, z: 27 };
            const whole = nav.pathDistances(from, 1.2, 40);
            for (const budget of [1, 7, 100, 5000]) {
                const search = new PathSearch(nav);
                search.begin(from, 1.2, 40);
                let slices = 1;
                while (!search.advance(budget)) {
                    slices++;
                }
                expect(search.distances).toEqual(whole);
                if (budget === 100) {
                    expect(slices).toBeGreaterThan(1);
                }
            }
        }
    });

    it('is not done until the last cell is settled, and stays done', () => {
        const nav = city(5);
        const search = new PathSearch(nav);
        expect(search.done).toBe(true);
        search.begin({ x: 0, z: 0 }, 1, Infinity);
        expect(search.done).toBe(false);
        expect(search.advance(10)).toBe(false);
        expect(search.advance(Infinity)).toBe(true);
        expect(search.advance(10)).toBe(true);
    });

    it('starting again drops the search in progress, and reuses the array it is given', () => {
        const nav = city(6);
        const out = new Float64Array(nav.size * nav.size);
        const search = new PathSearch(nav);
        search.begin({ x: -20, z: -20 }, 1, Infinity, out);
        search.advance(50);
        search.begin({ x: 20, z: 20 }, 2, 30, out);
        search.advance(Infinity);
        expect(search.distances).toBe(out);
        expect(Array.from(out)).toEqual(Array.from(nav.pathDistances({ x: 20, z: 20 }, 2, 30)));
    });

    it('is done at once, with nothing reachable, when Benny does not fit where it starts', () => {
        const nav = city(7);
        const search = new PathSearch(nav);
        search.begin({ x: 0, z: 0 }, 200, Infinity);
        expect(search.done).toBe(true);
        expect(search.distances.every((d) => d === Infinity)).toBe(true);
    });
});
