import { describe, expect, it } from 'vitest';

import { CAMERA } from '../config/tuning';

import {
    BuildingIndex,
    cameraDistanceAt,
    cameraPosition,
    lookAhead,
    occludingBuildings,
    segmentHitsBox,
    smoothingFactor
} from './camera';
import type { Building } from './city/types';

describe('camera rules', () => {
    it('pulls back from 18 m to 40 m as Benny grows', () => {
        expect(cameraDistanceAt(0)).toBe(CAMERA.distance.slimMetres);
        expect(cameraDistanceAt(1)).toBe(CAMERA.distance.maxWeightMetres);
        expect(cameraDistanceAt(0.5)).toBe((CAMERA.distance.slimMetres + CAMERA.distance.maxWeightMetres) / 2);
        expect(cameraDistanceAt(4)).toBe(CAMERA.distance.maxWeightMetres);
    });

    it('looks ahead in the direction of travel, capped', () => {
        expect(lookAhead(0, 0)).toEqual({ x: 0, z: 0 });
        const slow = lookAhead(2, 0);
        expect(slow.x).toBeCloseTo(2 * CAMERA.lookAheadSeconds, 10);
        const fast = lookAhead(0, -100);
        expect(fast.z).toBeCloseTo(-CAMERA.maxLookAheadMetres, 10);
        expect(fast.x).toBeCloseTo(0, 10);
    });

    it('smooths exponentially, independent of how the time is sliced', () => {
        expect(smoothingFactor(5, 0)).toBe(0);
        expect(smoothingFactor(5, -1)).toBe(0);
        const once = smoothingFactor(5, 0.2);
        const twice = 1 - (1 - smoothingFactor(5, 0.1)) ** 2;
        expect(once).toBeCloseTo(twice, 12);
        expect(smoothingFactor(5, 100)).toBeCloseTo(1, 10);
    });

    it('stands above and behind the focus point at the design pitch', () => {
        const p = cameraPosition({ x: 3, z: 4 }, 18);
        expect(p.x).toBe(3);
        expect(Math.hypot(p.y, p.z - 4)).toBeCloseTo(18, 10);
        expect((Math.atan2(p.y, p.z - 4) * 180) / Math.PI).toBeCloseTo(CAMERA.pitchDegrees, 10);
    });
});

describe('segmentHitsBox', () => {
    const min = { x: 0, y: 0, z: 0 };
    const max = { x: 2, y: 2, z: 2 };

    it('detects segments crossing, entering or missing the box', () => {
        expect(segmentHitsBox({ x: -1, y: 1, z: 1 }, { x: 3, y: 1, z: 1 }, min, max)).toBe(true);
        expect(segmentHitsBox({ x: -1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, min, max)).toBe(true);
        expect(segmentHitsBox({ x: -1, y: 3, z: 1 }, { x: 3, y: 3, z: 1 }, min, max)).toBe(false);
        expect(segmentHitsBox({ x: -3, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }, min, max)).toBe(false);
        expect(segmentHitsBox({ x: -1, y: -1, z: 1 }, { x: 3, y: 3, z: 1 }, min, max)).toBe(true);
        expect(segmentHitsBox({ x: -1, y: 1, z: -1 }, { x: 1, y: 5, z: 3 }, min, max)).toBe(false);
    });
});

describe('occludingBuildings', () => {
    const building = (x0: number, z0: number, x1: number, z1: number, height: number): Building => ({
        rect: { x0, z0, x1, z1 },
        height,
        colorIndex: 0
    });
    // Benny at the origin; the camera south of him (towards +z) and above
    const camera = cameraPosition({ x: 0, z: 0 }, 18);
    const benny = [{ x: 0, y: 0.8, z: 0 }];

    it('fades a tall building between the camera and Benny, and nothing else', () => {
        const index = new BuildingIndex([
            building(-5, 3, 5, 9, 12), // just south of Benny, tall: in the way
            building(-5, -9, 5, -3, 12), // north of Benny, behind him
            building(20, 3, 30, 9, 12), // off to the side
            building(-5, 3, 5, 9, 1) // low wall south of him, below the line of sight
        ]);
        expect(occludingBuildings(index, camera, benny)).toEqual([0]);
    });

    it('checks every target point and returns sorted, unique indices', () => {
        const index = new BuildingIndex([building(6, 3, 10, 9, 12), building(-10, 3, -6, 9, 12)]);
        const wide = [
            { x: -8, y: 1, z: 0 },
            { x: 8, y: 1, z: 0 },
            { x: 8, y: 2, z: 0 }
        ];
        expect(occludingBuildings(index, camera, wide)).toEqual([0, 1]);
        expect(occludingBuildings(index, camera, [])).toEqual([]);
    });
});
