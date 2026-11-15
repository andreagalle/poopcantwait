import { CITY } from '../../config/tuning';
import type { StreetClass } from '../../config/tuning';
import type { Point, Rect } from '../city/types';

import type { LaneGraph } from './lanes';
import { armLayout, crossingReach } from './markings';
import type { Signal } from './signals';

/** The kinds of pole at the crossings (design: *Street props*). */
export type SignKind = 'traffic-light' | 'stop' | 'give-way' | 'crossing' | 'speed-30';

/** A pole at a crossing, on the sidewalk, facing the traffic it is for. */
export interface StreetSign {
    readonly kind: SignKind;
    readonly x: number;
    readonly z: number;
    /** Unit vector along an axis: the way its face looks, towards the traffic coming at it. */
    readonly facing: Point;
    /** A traffic light shows its crossing's light for the traffic along this axis. */
    readonly light?: { readonly node: number; readonly axis: 'x' | 'z' };
}

const major = (streetClass: StreetClass): boolean => streetClass === 'avenue' || streetClass === 'boulevard';
const inside = (p: Point, r: Rect): boolean => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1;

/**
 * The poles at the crossings: on every arm, at the corner on the right of the traffic coming in (right-hand traffic),
 * on the sidewalk, just past the building's corner, facing that traffic. Traffic lights where avenues and boulevards
 * cross; a stop sign on a street that meets an avenue or a boulevard, which itself gets a pedestrian crossing sign; a
 * give-way sign where two streets cross, for the traffic along z (the traffic along x has the way). A 30 limit stands
 * at the start of a street, for the traffic turning into it from an avenue or a boulevard. A pole only goes where there
 * is a sidewalk to stand on (`sidewalks`), so never in an alley mouth.
 */
export function placeStreetSigns(
    graph: LaneGraph,
    sidewalks: readonly Rect[],
    signals: ReadonlyMap<number, Signal>
): StreetSign[] {
    const signs: StreetSign[] = [];
    const onSidewalk = (p: Point): boolean => sidewalks.some((r) => inside(p, r));
    graph.nodes.forEach((n, node) => {
        const arms = n.edges.map((e) => graph.edges[e]);
        const anyMajor = arms.some((e) => major(e.streetClass));
        for (const edge of n.edges) {
            const e = graph.edges[edge];
            const d = { x: e.dx, z: e.dz };
            // Incoming traffic drives towards the crossing along -d, on the side of -across
            const across = { x: -e.dz, z: e.dx };
            const half = CITY.streetClasses[e.streetClass].widthMetres / 2;
            const sidewalk = CITY.sidewalkMetres[e.streetClass];
            const corner = (along: number): Point => ({
                x: n.x + d.x * along - across.x * (half - sidewalk / 2),
                z: n.z + d.z * along - across.z * (half - sidewalk / 2)
            });
            const reach = crossingReach(graph, node, edge);
            let kind: SignKind | null = null;
            if (signals.has(node)) {
                kind = 'traffic-light';
            } else if (!major(e.streetClass) && anyMajor) {
                kind = 'stop';
            } else if (major(e.streetClass) && arms.some((a) => !major(a.streetClass))) {
                kind = 'crossing';
            } else if (!major(e.streetClass) && e.dz !== 0) {
                kind = 'give-way';
            }
            const at = corner(reach + CITY.roadMarkings.zebra.gapMetres);
            if (kind && onSidewalk(at)) {
                const light =
                    kind === 'traffic-light' ? { node, axis: e.dx !== 0 ? ('x' as const) : ('z' as const) } : undefined;
                signs.push({ kind, x: at.x, z: at.z, facing: d, ...(light ? { light } : {}) });
            }
            // Traffic turning into a street from a bigger road: the limit, on its right past the zebra
            if (!major(e.streetClass) && anyMajor) {
                const out = { x: -across.x, z: -across.z };
                const along = armLayout(graph, node, edge).zebra[1] + 2;
                const p = {
                    x: n.x + d.x * along - out.x * (half - sidewalk / 2),
                    z: n.z + d.z * along - out.z * (half - sidewalk / 2)
                };
                if (onSidewalk(p)) {
                    signs.push({ kind: 'speed-30', x: p.x, z: p.z, facing: { x: -d.x, z: -d.z } });
                }
            }
        }
    });
    return signs;
}
