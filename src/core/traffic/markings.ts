import { CITY } from '../../config/tuning';
import type { StreetClass } from '../../config/tuning';
import type { Point, Rect } from '../city/types';

import type { LaneGraph } from './lanes';

/** The white paint on the roads (design: *Street props*, presentation only): rectangles on the ground. */
export interface Markings {
    /** Zebra crossings, stripe by stripe, on every arm of every crossing, just outside it. */
    readonly zebras: readonly Rect[];
    /** A bar across the lane coming into a crossing, just before its zebra: where a vehicle stops at a red light. */
    readonly stopLines: readonly Rect[];
    /** The dashed centre line of every road between its crossings. */
    readonly dashes: readonly Rect[];
}

const halfWidth = (streetClass: StreetClass): number => CITY.streetClasses[streetClass].widthMetres / 2;
/** Half the width of a road's carriageway: from its centre line to the kerb. */
const halfCarriageway = (streetClass: StreetClass): number => halfWidth(streetClass) - CITY.sidewalkMetres[streetClass];

/** The axis-aligned rectangle spanned by two points. */
function rectOf(a: Point, b: Point): Rect {
    return { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) };
}

/**
 * How far from a crossing's centre, along one of its arms, the road leaves the crossing: the half width of the widest
 * road across that arm. The zebra starts a little beyond.
 */
export function crossingReach(graph: LaneGraph, node: number, edge: number): number {
    const e = graph.edges[edge];
    let reach = 0;
    for (const other of graph.nodes[node].edges) {
        const o = graph.edges[other];
        if (o.dx * e.dx + o.dz * e.dz === 0) {
            reach = Math.max(reach, halfWidth(o.streetClass));
        }
    }
    return reach;
}

/** Where along an arm, from its crossing's centre, the zebra starts and ends, and the stop line before it lies. */
export function armLayout(graph: LaneGraph, node: number, edge: number): { zebra: [number, number]; stop: number } {
    const { gapMetres, depthMetres } = CITY.roadMarkings.zebra;
    const start = crossingReach(graph, node, edge) + gapMetres;
    const end = start + depthMetres;
    return { zebra: [start, end], stop: end + CITY.roadMarkings.stopLine.gapMetres };
}

/** The road markings of a city's lane graph (one entry per node and arm, one centre line per stretch of road). */
export function markingsOf(graph: LaneGraph): Markings {
    const { zebra, stopLine, dash } = CITY.roadMarkings;
    const zebras: Rect[] = [];
    const stopLines: Rect[] = [];
    const dashes: Rect[] = [];
    graph.nodes.forEach((n, node) => {
        for (const edge of n.edges) {
            const e = graph.edges[edge];
            const across = { x: -e.dz, z: e.dx };
            const at = (along: number, side: number): Point => ({
                x: n.x + e.dx * along + across.x * side,
                z: n.z + e.dz * along + across.z * side
            });
            const layout = armLayout(graph, node, edge);
            const half = halfCarriageway(e.streetClass);
            // Stripes along the traffic, side by side across the carriageway
            const count = Math.floor((2 * half) / zebra.pitchMetres);
            const first = -((count - 1) * zebra.pitchMetres) / 2;
            for (let i = 0; i < count; i++) {
                const c = first + i * zebra.pitchMetres;
                zebras.push(
                    rectOf(
                        at(layout.zebra[0], c - zebra.stripeMetres / 2),
                        at(layout.zebra[1], c + zebra.stripeMetres / 2)
                    )
                );
            }
            // Traffic coming in along this arm drives on its right: the side of -across
            stopLines.push(rectOf(at(layout.stop, 0), at(layout.stop + stopLine.depthMetres, -half)));
        }
    });
    graph.edges.forEach((e, edge) => {
        // One centre line per stretch: the edge that runs towards +x or +z
        if (e.dx < 0 || e.dz < 0) {
            return;
        }
        const from = graph.nodes[e.from];
        const start = armLayout(graph, e.from, edge).stop + stopLine.depthMetres + dash.gapMetres;
        const end = e.length - (armLayout(graph, e.to, e.reverse).stop + stopLine.depthMetres + dash.gapMetres);
        for (let s = start; s + dash.lengthMetres <= end; s += dash.lengthMetres + dash.gapMetres) {
            const a = {
                x: from.x + e.dx * s + e.dz * (dash.widthMetres / 2),
                z: from.z + e.dz * s + e.dx * (dash.widthMetres / 2)
            };
            const b = {
                x: from.x + e.dx * (s + dash.lengthMetres) - e.dz * (dash.widthMetres / 2),
                z: from.z + e.dz * (s + dash.lengthMetres) - e.dx * (dash.widthMetres / 2)
            };
            dashes.push(rectOf(a, b));
        }
    });
    return { zebras, stopLines, dashes };
}
