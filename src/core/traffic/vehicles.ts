import { COLLISIONS, TRAFFIC } from '../../config/tuning';
import type { Point, Rect } from '../city/types';
import type { Rng } from '../rng';

import type { LaneGraph } from './lanes';
import { busAllowed, lanePosition } from './lanes';
import { turnBetween, turnPose } from './turns';

export type VehicleType = 'car' | 'bus';

/** A vehicle driving along the lane graph (design: *Traffic*). */
export interface Vehicle {
    readonly id: number;
    readonly type: VehicleType;
    /** The edge it drives along, and how far along it, in metres. */
    readonly edge: number;
    readonly t: number;
    /**
     * The edge it takes at the end of this one, picked as it enters this one so it can start the turn in time. Past
     * the point where the turn leaves its lane, `t` counts the metres driven along the curve (`turnBetween`).
     */
    readonly next: number;
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
    const turn = turnBetween(graph, v.edge, v.next);
    if (v.t > turn.exit) {
        return turnPose(turn, v.t - turn.exit);
    }
    const e = graph.edges[v.edge];
    return { ...lanePosition(graph, v.edge, v.t), dx: e.dx, dz: e.dz };
}

/**
 * The vehicle's footprint on the ground: its box along a road, which runs along an axis, and the box around it while it
 * turns. A wreck is squashed in length.
 */
export function vehicleFootprint(v: Vehicle, pose: VehiclePose, lengthShare = 1): Rect {
    const size = TRAFFIC.size[v.type];
    const halfLength = (size.length * lengthShare) / 2;
    const halfWidth = size.width / 2;
    const hx = Math.abs(pose.dx) * halfLength + Math.abs(pose.dz) * halfWidth;
    const hz = Math.abs(pose.dz) * halfLength + Math.abs(pose.dx) * halfWidth;
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
        const speed = rng.range(range.min, range.max);
        return {
            id,
            type,
            edge,
            t,
            next: nextEdge(graph, type, edge, rng),
            speed,
            wreckSecondsLeft: 0,
            honkCooldown: 0
        };
    }
    return null;
}

/**
 * The way a vehicle takes at the end of an edge: a random one (any road for a car, avenues and boulevards only for a
 * bus), turning back only where there is no other way.
 */
function nextEdge(graph: LaneGraph, type: VehicleType, edge: number, rng: Rng): number {
    const here = graph.edges[edge];
    const ways = graph.nodes[here.to].edges.filter((e) => e !== here.reverse && allowed(graph, type, e));
    return ways.length > 0 ? rng.pick(ways) : here.reverse;
}

/**
 * The free road ahead of each vehicle, bumper to bumper, in metres: to the nearest vehicle ahead in its lane, on its
 * edge or on the next one it takes (`Infinity` when there is none). A vehicle ahead is one farther along, or as far
 * along with a higher id, so two vehicles never both wait for each other.
 */
export function gapsAhead(graph: LaneGraph, vehicles: readonly Vehicle[]): Float64Array {
    const gaps = new Float64Array(vehicles.length).fill(Infinity);
    for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        const turn = turnBetween(graph, v.edge, v.next);
        for (const other of vehicles) {
            let along: number;
            if (other.edge === v.edge && (other.t > v.t || (other.t === v.t && other.id > v.id))) {
                along = other.t - v.t;
            } else if (other.edge === v.next && other !== v) {
                along = turn.exit + turn.length - v.t + (other.t - turn.entry);
            } else {
                continue;
            }
            const bumpers = (lengthOf(v) + lengthOf(other)) / 2;
            gaps[i] = Math.min(gaps[i], along - bumpers);
        }
    }
    return gaps;
}

/** A vehicle's length on the road: a wreck is squashed. */
function lengthOf(v: Vehicle): number {
    const share = v.wreckSecondsLeft > 0 ? COLLISIONS.crumpledLengthShare : 1;
    return TRAFFIC.size[v.type].length * share;
}

/**
 * How fast a vehicle drives with `gap` metres of free road ahead: its cruising speed when the road is clear, slower as
 * the gap closes to `TRAFFIC.followGapMetres`, where it stops.
 */
export function followSpeed(cruise: number, gap: number): number {
    const speed = (gap - TRAFFIC.followGapMetres) / TRAFFIC.followHeadwaySeconds;
    return Math.min(cruise, Math.max(0, speed));
}

/**
 * Drives a vehicle for `dt` seconds at `speed` (its cruising speed unless it is held up, `followSpeed`). At the end of
 * an edge it rounds the corner into the one it picked when it entered it, and picks the next (`nextEdge`). Wrecks stay
 * put.
 */
export function driveVehicle(graph: LaneGraph, v: Vehicle, dt: number, rng: Rng, speed = v.speed): Vehicle {
    const honkCooldown = Math.max(0, v.honkCooldown - dt);
    if (v.wreckSecondsLeft > 0) {
        return { ...v, wreckSecondsLeft: Math.max(0, v.wreckSecondsLeft - dt), honkCooldown };
    }
    let { edge, next } = v;
    let t = v.t + speed * dt;
    for (
        let turn = turnBetween(graph, edge, next);
        t > turn.exit + turn.length;
        turn = turnBetween(graph, edge, next)
    ) {
        t = turn.entry + (t - turn.exit - turn.length);
        edge = next;
        next = nextEdge(graph, v.type, edge, rng);
    }
    return { ...v, edge, t, next, honkCooldown };
}
