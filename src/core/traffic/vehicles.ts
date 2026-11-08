import { TRAFFIC } from '../../config/tuning';
import type { Point, Rect } from '../city/types';
import type { Rng } from '../rng';

import type { LaneGraph } from './lanes';
import { busAllowed, lanePosition } from './lanes';

export type VehicleType = 'car' | 'bus';

/** A vehicle driving along the lane graph (design: *Traffic*). */
export interface Vehicle {
    readonly id: number;
    readonly type: VehicleType;
    /** The edge it drives along, and how far along it, in metres. */
    readonly edge: number;
    readonly t: number;
    /** Cruising speed, in m/s, drawn per vehicle. */
    readonly speed: number;
    /** Above 0 it is a crumpled wreck, gone when this runs out, in seconds. */
    readonly wreckSecondsLeft: number;
    /** Seconds until it may honk again. */
    readonly honkCooldown: number;
}

/** Where a vehicle is and which way it faces. */
export interface VehiclePose {
    readonly x: number;
    readonly z: number;
    readonly dx: number;
    readonly dz: number;
}

/** Density factor after `elapsedSeconds`: +15% a minute, at most three times the initial traffic. */
export function densityFactorAt(elapsedSeconds: number): number {
    const grown = 1 + TRAFFIC.densityGrowthPerMinute * (Math.max(0, elapsedSeconds) / 60);
    return Math.min(TRAFFIC.maxDensityFactor, grown);
}

/** How many cars and buses the city should have after `elapsedSeconds`. */
export function targetCounts(elapsedSeconds: number): { car: number; bus: number } {
    const f = densityFactorAt(elapsedSeconds);
    return { car: Math.round(TRAFFIC.initialCount.cars * f), bus: Math.round(TRAFFIC.initialCount.buses * f) };
}

const allowed = (graph: LaneGraph, type: VehicleType, edge: number): boolean =>
    type === 'car' || busAllowed(graph.edges[edge].streetClass);

export function vehiclePose(graph: LaneGraph, v: Vehicle): VehiclePose {
    const e = graph.edges[v.edge];
    return { ...lanePosition(graph, v.edge, v.t), dx: e.dx, dz: e.dz };
}

/** The vehicle's footprint on the ground (roads are axis-aligned, so it is too); a wreck is squashed in length. */
export function vehicleFootprint(v: Vehicle, pose: VehiclePose, lengthShare = 1): Rect {
    const size = TRAFFIC.size[v.type];
    const halfLength = (size.length * lengthShare) / 2;
    const halfWidth = size.width / 2;
    const hx = pose.dx !== 0 ? halfLength : halfWidth;
    const hz = pose.dz !== 0 ? halfLength : halfWidth;
    return { x0: pose.x - hx, z0: pose.z - hz, x1: pose.x + hx, z1: pose.z + hz };
}

/** A new vehicle on a random lane it may use, at least `minDistance` from `avoid`; `null` if none is found. */
export function spawnVehicle(
    graph: LaneGraph,
    id: number,
    type: VehicleType,
    rng: Rng,
    avoid: Point,
    minDistance: number
): Vehicle | null {
    const range = TRAFFIC.speedMetresPerSecond[type];
    for (let attempt = 0; attempt < 40; attempt++) {
        const edge = rng.int(0, graph.edges.length - 1);
        if (!allowed(graph, type, edge)) {
            continue;
        }
        const t = rng.range(0, graph.edges[edge].length);
        const p = lanePosition(graph, edge, t);
        if (Math.hypot(p.x - avoid.x, p.z - avoid.z) < minDistance) {
            continue;
        }
        return { id, type, edge, t, speed: rng.range(range.min, range.max), wreckSecondsLeft: 0, honkCooldown: 0 };
    }
    return null;
}

/**
 * Drives a vehicle for `dt` seconds. At the end of an edge it picks a random way on (any road for a car, avenues and
 * boulevards only for a bus), turning back only where there is no other way. Wrecks stay put.
 */
export function driveVehicle(graph: LaneGraph, v: Vehicle, dt: number, rng: Rng): Vehicle {
    const honkCooldown = Math.max(0, v.honkCooldown - dt);
    if (v.wreckSecondsLeft > 0) {
        return { ...v, wreckSecondsLeft: Math.max(0, v.wreckSecondsLeft - dt), honkCooldown };
    }
    let edge = v.edge;
    let t = v.t + v.speed * dt;
    while (t > graph.edges[edge].length) {
        t -= graph.edges[edge].length;
        const here = graph.edges[edge];
        const ways = graph.nodes[here.to].edges.filter((e) => e !== here.reverse && allowed(graph, v.type, e));
        edge = ways.length > 0 ? rng.pick(ways) : here.reverse;
    }
    return { ...v, edge, t, honkCooldown };
}
