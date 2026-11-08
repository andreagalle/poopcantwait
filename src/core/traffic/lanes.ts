import { CITY, TRAFFIC } from '../../config/tuning';
import type { StreetClass } from '../../config/tuning';
import type { City, Road } from '../city/types';

/**
 * The road network vehicles drive on (design: *Traffic*): intersections of the centre lines of streets, avenues and
 * boulevards (never alleys) as nodes, the stretches of road between neighbouring intersections as edges. Each edge
 * can be driven both ways, one lane per direction.
 */
export interface LaneNode {
    readonly x: number;
    readonly z: number;
    /** Edges leaving this node. */
    readonly edges: number[];
}

export interface LaneEdge {
    readonly from: number;
    readonly to: number;
    /** The class of the road this stretch belongs to. */
    readonly streetClass: StreetClass;
    readonly length: number;
    /** Unit direction of travel from `from` to `to`: always along x or z. */
    readonly dx: number;
    readonly dz: number;
    /** The same stretch driven the other way. */
    readonly reverse: number;
}

export interface LaneGraph {
    readonly nodes: readonly LaneNode[];
    readonly edges: readonly LaneEdge[];
}

const halfWidth = (road: Road): number => CITY.streetClasses[road.streetClass].widthMetres / 2;

/** Whether buses may drive on a road class: avenues and boulevards only. */
export const busAllowed = (streetClass: StreetClass): boolean => CITY.streetClasses[streetClass].buses;

/** How far a lane runs from the road's centre line, in metres. */
export const laneOffset = (streetClass: StreetClass): number =>
    CITY.streetClasses[streetClass].widthMetres * TRAFFIC.laneOffsetShare;

/** Builds the lane graph of a city. */
export function buildLaneGraph(city: City): LaneGraph {
    const roads = city.roads.filter((r) => CITY.streetClasses[r.streetClass].cars);
    const nodes: { x: number; z: number; edges: number[] }[] = [];
    const nodeAt = new Map<string, number>();
    const node = (x: number, z: number): number => {
        const key = `${x},${z}`;
        let index = nodeAt.get(key);
        if (index === undefined) {
            index = nodes.length;
            nodes.push({ x, z, edges: [] });
            nodeAt.set(key, index);
        }
        return index;
    };

    // Where a road's centre line meets a crossing road's centre line, its ends reaching into the road they join
    const stops = new Map<Road, Set<number>>(roads.map((r) => [r, new Set<number>()]));
    for (const a of roads.filter((r) => r.axis === 'x')) {
        for (const b of roads.filter((r) => r.axis === 'z')) {
            const meets =
                b.centre >= a.from - halfWidth(b) &&
                b.centre <= a.to + halfWidth(b) &&
                a.centre >= b.from - halfWidth(a) &&
                a.centre <= b.to + halfWidth(a);
            if (meets) {
                stops.get(a)!.add(b.centre);
                stops.get(b)!.add(a.centre);
            }
        }
    }

    const edges: LaneEdge[] = [];
    for (const road of roads) {
        const along = [...stops.get(road)!].sort((p, q) => p - q);
        for (let i = 0; i + 1 < along.length; i++) {
            const [p, q] = [along[i], along[i + 1]];
            const from = road.axis === 'x' ? node(p, road.centre) : node(road.centre, p);
            const to = road.axis === 'x' ? node(q, road.centre) : node(road.centre, q);
            const dx = road.axis === 'x' ? 1 : 0;
            const dz = road.axis === 'z' ? 1 : 0;
            const forward = edges.length;
            edges.push({ from, to, streetClass: road.streetClass, length: q - p, dx, dz, reverse: forward + 1 });
            edges.push({
                from: to,
                to: from,
                streetClass: road.streetClass,
                length: q - p,
                dx: -dx,
                dz: -dz,
                reverse: forward
            });
            nodes[from].edges.push(forward);
            nodes[to].edges.push(forward + 1);
        }
    }
    return { nodes, edges };
}

/** A point on an edge, `t` metres from its start, in the lane on the right of the direction of travel. */
export function lanePosition(graph: LaneGraph, edge: number, t: number): { x: number; z: number } {
    const e = graph.edges[edge];
    const start = graph.nodes[e.from];
    const offset = laneOffset(e.streetClass);
    // The right of the direction (dx, dz) on screen (x right, z down) is (-dz, dx)
    return { x: start.x + e.dx * t - e.dz * offset, z: start.z + e.dz * t + e.dx * offset };
}
