import { describe, expect, it } from 'vitest';

import type { CollisionWorld } from './collision';
import { overlapDepth, pushOut } from './collision';

/** A hand-built world: a 6 m street between two building rows (z < -3 and z > 3), a post at (10, 0). */
function streetWorld(): CollisionWorld {
    const rects = [
        { x0: -40, z0: -20, x1: 40, z1: -3 },
        { x0: -40, z0: 3, x1: 40, z1: 20 }
    ];
    const circles = [{ x: 10, z: 0, radius: 0.5 }];
    const cells = new Map<number, { rects: number[]; circles: number[] }>();
    // Every lookup lands on one cell listing everything: fine for a world this small
    const all = { rects: [0, 1], circles: [0] };
    for (let cx = -10; cx <= 10; cx++) {
        for (let cz = -10; cz <= 10; cz++) {
            cells.set((cx + 1024) * 4096 + (cz + 1024), all);
        }
    }
    return { halfSize: 50, rects, circles, cells };
}

describe('collision', () => {
    const world = streetWorld();

    it('leaves a circle that touches nothing where it is', () => {
        const out = pushOut(world, 0, 0, 1);
        expect(out).toEqual({ x: 0, z: 0, contacts: [] });
        expect(overlapDepth(world, 0, 0, 1)).toBe(0);
    });

    it('pushes a circle out of a wall along its normal', () => {
        const out = pushOut(world, 0, 2.5, 1);
        expect(out.x).toBeCloseTo(0, 10);
        expect(out.z).toBeCloseTo(2, 10);
        expect(out.contacts).toEqual([{ nx: 0, nz: -1 }]);
        expect(overlapDepth(world, out.x, out.z, 1)).toBeLessThanOrEqual(1e-9);
    });

    it('pushes a circle whose centre is inside a building out through the nearest side', () => {
        const out = pushOut(world, 0, 3.4, 0.5);
        expect(out.z).toBeCloseTo(2.5, 10);
        expect(overlapDepth(world, 0, 3.4, 0.5)).toBe(0.5);
    });

    it('pushes a circle off a round post', () => {
        const out = pushOut(world, 10.5, 0, 0.5);
        expect(out.x).toBeCloseTo(11, 10);
        expect(out.z).toBeCloseTo(0, 10);
    });

    it('keeps a circle inside the city border', () => {
        const out = pushOut(world, 49.8, 0, 1);
        expect(out.x).toBeCloseTo(49, 10);
        expect(out.contacts).toContainEqual({ nx: -1, nz: 0 });
        expect(pushOut(world, 0, -49.9, 1).z).toBeCloseTo(-49, 10);
        expect(overlapDepth(world, -49.5, 0, 1)).toBeCloseTo(0.5, 10);
    });

    it('cannot fit a circle wider than the street', () => {
        expect(overlapDepth(world, 0, 0, 3.5)).toBeGreaterThan(0.4);
        const out = pushOut(world, 0, 0, 3.5);
        expect(overlapDepth(world, out.x, out.z, 3.5)).toBeGreaterThan(0.4);
    });
});
