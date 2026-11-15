import { describe, expect, it } from 'vitest';

import { CITY } from '../../config/tuning';
import { generateCity } from '../city/generate';
import { ZONE } from '../city/types';

import { buildLaneGraph } from './lanes';
import { armLayout, markingsOf } from './markings';

describe('road markings', () => {
    const city = generateCity(42);
    const graph = buildLaneGraph(city);
    const markings = markingsOf(graph);
    const roads: number[] = [ZONE.street, ZONE.avenue, ZONE.boulevard];
    const onRoad = (x: number, z: number) => roads.includes(city.nav.zoneAt(x, z));

    it('paint a zebra and a stop line on every arm of every crossing', () => {
        const arms = graph.nodes.reduce((sum, n) => sum + n.edges.length, 0);
        expect(markings.stopLines).toHaveLength(arms);
        expect(markings.zebras.length).toBeGreaterThanOrEqual(arms * 4);
        expect(markings.dashes.length).toBeGreaterThan(200);
    });

    it('lie on the roads, never on a building or a sidewalk', () => {
        for (const r of [...markings.zebras, ...markings.stopLines, ...markings.dashes]) {
            expect(onRoad((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2), JSON.stringify(r)).toBe(true);
        }
    });

    it('put the stop line before the zebra, the zebra out of the crossing', () => {
        graph.nodes.forEach((n, node) => {
            for (const edge of n.edges) {
                const layout = armLayout(graph, node, edge);
                expect(layout.zebra[0]).toBeGreaterThan(0);
                expect(layout.zebra[1] - layout.zebra[0]).toBeCloseTo(CITY.roadMarkings.zebra.depthMetres, 9);
                expect(layout.stop).toBeGreaterThan(layout.zebra[1]);
                expect(layout.stop).toBeLessThan(graph.edges[edge].length / 2);
            }
        });
    });
});
