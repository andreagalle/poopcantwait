import { CITY, TRAFFIC } from '../../config/tuning';

import type { LaneGraph } from './lanes';
import { armLayout } from './markings';
import type { Vehicle } from './vehicles';

/** What a traffic light shows to the traffic along one axis. */
export type Light = 'green' | 'amber' | 'red';

/** A crossing with traffic lights, and where it is in its cycle at time 0, in seconds. */
export interface Signal {
    readonly node: number;
    readonly offset: number;
}

const major = (streetClass: string): boolean => streetClass === 'avenue' || streetClass === 'boulevard';

/** Seconds of one full cycle: green, amber and all red for one axis, then the same for the other. */
export function cycleSeconds(): number {
    const { greenSeconds, amberSeconds, allRedSeconds } = TRAFFIC.signals;
    return 2 * (greenSeconds + amberSeconds + allRedSeconds);
}

/**
 * The crossings with traffic lights (design: *Traffic*): where an avenue or a boulevard crosses another, both ways.
 * Each starts at its own point of the cycle, spread evenly by its index, so the lights of the city do not all change
 * together.
 */
export function signalsOf(graph: LaneGraph): Signal[] {
    const signals: Signal[] = [];
    graph.nodes.forEach((n, node) => {
        const arms = n.edges.map((e) => graph.edges[e]).filter((e) => major(e.streetClass));
        const alongX = arms.some((e) => e.dx !== 0);
        const alongZ = arms.some((e) => e.dz !== 0);
        if (alongX && alongZ) {
            signals.push({ node, offset: (signals.length * TRAFFIC.signals.staggerSeconds) % cycleSeconds() });
        }
    });
    return signals;
}

/** What a signal shows to the traffic along an axis at a time, in seconds of game time. */
export function lightAt(signal: Signal, axis: 'x' | 'z', time: number): Light {
    const { greenSeconds, amberSeconds, allRedSeconds } = TRAFFIC.signals;
    const half = greenSeconds + amberSeconds + allRedSeconds;
    const cycle = 2 * half;
    const t = (((time + signal.offset) % cycle) + cycle) % cycle;
    // The x axis has the first half of the cycle, the z axis the second
    const own = axis === 'x' ? t : (t + half) % cycle;
    if (own < greenSeconds) {
        return 'green';
    }
    if (own < greenSeconds + amberSeconds) {
        return 'amber';
    }
    return 'red';
}

/**
 * The free road a vehicle has before the stop line of a red light ahead, in metres, in the same terms as `gapsAhead`
 * (so `followSpeed` stops it at the line): `Infinity` when its light is green, when it has passed the line, or on amber
 * when it is too close to stop.
 */
export function signalGap(graph: LaneGraph, signals: ReadonlyMap<number, Signal>, v: Vehicle, time: number): number {
    const e = graph.edges[v.edge];
    const signal = signals.get(e.to);
    if (!signal || v.wreckSecondsLeft > 0) {
        return Infinity;
    }
    const light = lightAt(signal, e.dx !== 0 ? 'x' : 'z', time);
    if (light === 'green') {
        return Infinity;
    }
    // The stop line's far edge, out from the crossing's centre along this road, and the vehicle's front from there
    const line = armLayout(graph, e.to, e.reverse).stop + CITY.roadMarkings.stopLine.depthMetres;
    const front = e.length - v.t - TRAFFIC.size[v.type].length / 2;
    const toLine = front - line;
    if (toLine < 0 || (light === 'amber' && toLine < TRAFFIC.signals.amberCommitMetres)) {
        return Infinity;
    }
    return toLine + TRAFFIC.followGapMetres;
}
