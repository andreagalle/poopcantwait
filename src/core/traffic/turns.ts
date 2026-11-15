import { TRAFFIC } from '../../config/tuning';

import type { LaneGraph } from './lanes';
import { laneOffset, lanePosition } from './lanes';

/** A point on the ground and the unit direction of travel there. */
export interface TurnPose {
    readonly x: number;
    readonly z: number;
    readonly dx: number;
    readonly dz: number;
}

/**
 * How a vehicle goes from one edge to the next (design: *Traffic*): it leaves its lane on the first edge `exit` metres
 * along it, drives `length` metres of curve, and joins its lane on the next edge `entry` metres along that one. It never
 * jumps from lane to lane nor snaps round.
 */
export interface Turn {
    readonly exit: number;
    readonly entry: number;
    readonly length: number;
    /** The four control points of the cubic curve, x and z interleaved. */
    readonly controls: Float64Array;
    /** The length of the curve up to each of `SAMPLES + 1` evenly spaced curve parameters. */
    readonly lengths: Float64Array;
}

/** Samples along a curve to measure it, enough for its length to be right within centimetres. */
const SAMPLES = 24;
/** Handle length of a cubic curve that draws a quarter circle, as a share of its radius. */
const QUARTER_CIRCLE = 0.5523;
/** Handle length of a cubic curve that draws a half circle, as a share of its radius. */
const HALF_CIRCLE = 4 / 3;

const cache = new WeakMap<LaneGraph, Map<number, Turn>>();

function bezier(c: Float64Array, u: number): { x: number; z: number; tx: number; tz: number } {
    const s = 1 - u;
    const [x0, z0, x1, z1, x2, z2, x3, z3] = c;
    return {
        x: s * s * s * x0 + 3 * s * s * u * x1 + 3 * s * u * u * x2 + u * u * u * x3,
        z: s * s * s * z0 + 3 * s * s * u * z1 + 3 * s * u * u * z2 + u * u * u * z3,
        tx: 3 * s * s * (x1 - x0) + 6 * s * u * (x2 - x1) + 3 * u * u * (x3 - x2),
        tz: 3 * s * s * (z1 - z0) + 6 * s * u * (z2 - z1) + 3 * u * u * (z3 - z2)
    };
}

function buildTurn(graph: LaneGraph, a: number, b: number): Turn {
    const ea = graph.edges[a];
    const eb = graph.edges[b];
    const along = ea.dx * eb.dx + ea.dz * eb.dz;
    let radius: number = TRAFFIC.turnRadiusMetres.left;
    let p0: { x: number; z: number };
    let p3: { x: number; z: number };
    let handle: number;
    if (along === 0) {
        // Round the corner where the two lanes cross on a quarter circle: tight on a turn to the right, wide to the left
        const onA = lanePosition(graph, a, ea.length);
        const onB = lanePosition(graph, b, 0);
        const corner = { x: ea.dx !== 0 ? onB.x : onA.x, z: ea.dz !== 0 ? onB.z : onA.z };
        // A right turn meets the crossing lane before reaching the middle of the crossing
        const right = (corner.x - onA.x) * ea.dx + (corner.z - onA.z) * ea.dz < 0;
        radius = right ? TRAFFIC.turnRadiusMetres.right : TRAFFIC.turnRadiusMetres.left;
        p0 = { x: corner.x - ea.dx * radius, z: corner.z - ea.dz * radius };
        p3 = { x: corner.x + eb.dx * radius, z: corner.z + eb.dz * radius };
        handle = QUARTER_CIRCLE * radius;
    } else if (along > 0) {
        // Straight on: stay in lane (or move over smoothly, should the road change class)
        p0 = lanePosition(graph, a, ea.length - radius);
        p3 = lanePosition(graph, b, radius);
        handle = (2 / 3) * radius;
    } else {
        // Turning back where there is no other way: a half circle over to the other lane
        p0 = lanePosition(graph, a, ea.length);
        p3 = lanePosition(graph, b, 0);
        handle = (HALF_CIRCLE * (laneOffset(ea.streetClass) + laneOffset(eb.streetClass))) / 2;
    }
    const controls = new Float64Array([
        p0.x,
        p0.z,
        p0.x + ea.dx * handle,
        p0.z + ea.dz * handle,
        p3.x - eb.dx * handle,
        p3.z - eb.dz * handle,
        p3.x,
        p3.z
    ]);
    const lengths = new Float64Array(SAMPLES + 1);
    let previous = bezier(controls, 0);
    for (let i = 1; i <= SAMPLES; i++) {
        const point = bezier(controls, i / SAMPLES);
        lengths[i] = lengths[i - 1] + Math.hypot(point.x - previous.x, point.z - previous.z);
        previous = point;
    }
    // How far along each lane the curve leaves and joins it
    const startA = lanePosition(graph, a, 0);
    const startB = lanePosition(graph, b, 0);
    const exit = (p0.x - startA.x) * ea.dx + (p0.z - startA.z) * ea.dz;
    const entry = (p3.x - startB.x) * eb.dx + (p3.z - startB.z) * eb.dz;
    return { exit, entry, length: lengths[SAMPLES], controls, lengths };
}

/** The turn from edge `a` into edge `b`, which starts where `a` ends (computed once per graph and pair). */
export function turnBetween(graph: LaneGraph, a: number, b: number): Turn {
    let turns = cache.get(graph);
    if (!turns) {
        turns = new Map();
        cache.set(graph, turns);
    }
    const key = a * graph.edges.length + b;
    let turn = turns.get(key);
    if (!turn) {
        turn = buildTurn(graph, a, b);
        turns.set(key, turn);
    }
    return turn;
}

/** Where a vehicle is `distance` metres into a turn, and which way it faces. */
export function turnPose(turn: Turn, distance: number): TurnPose {
    const d = Math.min(Math.max(distance, 0), turn.length);
    const { lengths } = turn;
    let i = 0;
    while (i < SAMPLES - 1 && lengths[i + 1] < d) {
        i++;
    }
    const span = lengths[i + 1] - lengths[i];
    const u = (i + (span > 0 ? (d - lengths[i]) / span : 0)) / SAMPLES;
    const point = bezier(turn.controls, u);
    const speed = Math.hypot(point.tx, point.tz);
    return speed > 0
        ? { x: point.x, z: point.z, dx: point.tx / speed, dz: point.tz / speed }
        : { x: point.x, z: point.z, dx: turn.controls[6] - turn.controls[4], dz: turn.controls[7] - turn.controls[5] };
}
