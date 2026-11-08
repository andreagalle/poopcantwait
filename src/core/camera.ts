import { CAMERA } from '../config/tuning';

import type { Building } from './city/types';
import { clampWeight } from './player/weight';

/**
 * The camera rules (design: *Camera*), engine-free: how far it stands from Benny, where it aims, and which buildings
 * get in the way.
 */

export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** Distance from Benny: 18 m when slim, 40 m at maximum weight (initial tuning), linear in between. */
export function cameraDistanceAt(w: number): number {
    const { slimMetres, maxWeightMetres } = CAMERA.distance;
    return slimMetres + (maxWeightMetres - slimMetres) * clampWeight(w);
}

/** Where the camera aims ahead of Benny: his velocity times the look-ahead time, capped. */
export function lookAhead(vx: number, vz: number): { x: number; z: number } {
    let x = vx * CAMERA.lookAheadSeconds;
    let z = vz * CAMERA.lookAheadSeconds;
    const length = Math.hypot(x, z);
    if (length > CAMERA.maxLookAheadMetres) {
        x *= CAMERA.maxLookAheadMetres / length;
        z *= CAMERA.maxLookAheadMetres / length;
    }
    return { x, z };
}

/** Exponential smoothing: the share of the remaining gap to close over `dt` seconds at `ratePerSecond`. */
export function smoothingFactor(ratePerSecond: number, dt: number): number {
    return 1 - Math.exp(-ratePerSecond * Math.max(0, dt));
}

/** Camera position for a ground focus point: above and behind it (towards +z), looking down at the design pitch. */
export function cameraPosition(focus: { x: number; z: number }, distance: number): Vec3 {
    const pitch = (CAMERA.pitchDegrees * Math.PI) / 180;
    return { x: focus.x, y: distance * Math.sin(pitch), z: focus.z + distance * Math.cos(pitch) };
}

/** Whether the segment from `a` to `b` passes through the axis-aligned box (slab test). */
export function segmentHitsBox(a: Vec3, b: Vec3, min: Vec3, max: Vec3): boolean {
    let t0 = 0;
    let t1 = 1;
    for (const axis of ['x', 'y', 'z'] as const) {
        const d = b[axis] - a[axis];
        if (Math.abs(d) < 1e-12) {
            if (a[axis] < min[axis] || a[axis] > max[axis]) {
                return false;
            }
            continue;
        }
        let ta = (min[axis] - a[axis]) / d;
        let tb = (max[axis] - a[axis]) / d;
        if (ta > tb) {
            [ta, tb] = [tb, ta];
        }
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) {
            return false;
        }
    }
    return true;
}

/** Buildings grouped by 8 m cells, so the occlusion test only looks at buildings near the line of sight. */
export class BuildingIndex {
    private static readonly CELL = 8;
    readonly buildings: readonly Building[];
    private readonly cells = new Map<number, number[]>();

    constructor(buildings: readonly Building[]) {
        this.buildings = buildings;
        buildings.forEach((b, i) => {
            for (
                let cx = Math.floor(b.rect.x0 / BuildingIndex.CELL);
                cx <= Math.floor(b.rect.x1 / BuildingIndex.CELL);
                cx++
            ) {
                for (
                    let cz = Math.floor(b.rect.z0 / BuildingIndex.CELL);
                    cz <= Math.floor(b.rect.z1 / BuildingIndex.CELL);
                    cz++
                ) {
                    const key = BuildingIndex.key(cx, cz);
                    const list = this.cells.get(key);
                    if (list) {
                        list.push(i);
                    } else {
                        this.cells.set(key, [i]);
                    }
                }
            }
        });
    }

    private static key(cx: number, cz: number): number {
        return (cx + 1024) * 4096 + (cz + 1024);
    }

    /** Indices of buildings whose cells overlap the box from `(x0, z0)` to `(x1, z1)`. */
    near(x0: number, z0: number, x1: number, z1: number): Set<number> {
        const found = new Set<number>();
        for (let cx = Math.floor(x0 / BuildingIndex.CELL); cx <= Math.floor(x1 / BuildingIndex.CELL); cx++) {
            for (let cz = Math.floor(z0 / BuildingIndex.CELL); cz <= Math.floor(z1 / BuildingIndex.CELL); cz++) {
                this.cells.get(BuildingIndex.key(cx, cz))?.forEach((i) => found.add(i));
            }
        }
        return found;
    }
}

/**
 * The buildings to fade: those crossed by a line of sight from the camera to any of `targets` (points on Benny's
 * body), with each building grown by the fade margin. Returned sorted, so callers can compare sets cheaply.
 */
export function occludingBuildings(index: BuildingIndex, camera: Vec3, targets: readonly Vec3[]): number[] {
    const m = CAMERA.fadeMarginMetres;
    const hits = new Set<number>();
    for (const target of targets) {
        const candidates = index.near(
            Math.min(camera.x, target.x) - m,
            Math.min(camera.z, target.z) - m,
            Math.max(camera.x, target.x) + m,
            Math.max(camera.z, target.z) + m
        );
        for (const i of candidates) {
            if (hits.has(i)) {
                continue;
            }
            const r = index.buildings[i].rect;
            const min = { x: r.x0 - m, y: 0, z: r.z0 - m };
            const max = { x: r.x1 + m, y: index.buildings[i].height + m, z: r.z1 + m };
            if (segmentHitsBox(camera, target, min, max)) {
                hits.add(i);
            }
        }
    }
    return [...hits].sort((a, b) => a - b);
}
