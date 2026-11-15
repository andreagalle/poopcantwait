import { describe, expect, it } from 'vitest';

import { CITY } from '../../config/tuning';
import { buildLaneGraph, laneOffset } from '../traffic/lanes';

import { generateCity } from './generate';
import { sidewalksOf } from './sidewalks';
import { ZONE } from './types';

describe('sidewalks', () => {
    const city = generateCity(42);
    const sidewalks = sidewalksOf(city);

    it('line the facades of streets, avenues and boulevards', () => {
        expect(sidewalks.length).toBeGreaterThan(300);
        for (const { rect: r } of sidewalks) {
            expect(r.x1).toBeGreaterThan(r.x0);
            expect(r.z1).toBeGreaterThan(r.z0);
            // Never in an alley, and never on a building
            const zone = city.nav.zoneAt((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
            // (the edge cells of the plaza and the park count as theirs)
            expect([ZONE.street, ZONE.avenue, ZONE.boulevard, ZONE.blocked, ZONE.plaza, ZONE.park]).toContain(zone);
            expect(city.buildings.some(({ rect: b }) => r.x0 < b.x1 && r.x1 > b.x0 && r.z0 < b.z1 && r.z1 > b.z0)).toBe(
                false
            );
        }
    });

    it('stay clear of the lanes', () => {
        const graph = buildLaneGraph(city);
        for (const e of graph.edges) {
            const from = graph.nodes[e.from];
            const to = graph.nodes[e.to];
            const size = CITY.streetClasses[e.streetClass].widthMetres;
            // The side of the widest vehicle that drives there, out from the road's centre line
            const vehicle = e.streetClass === 'street' ? 1.9 : 2.6;
            const reach = laneOffset(e.streetClass) + vehicle / 2;
            const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
            for (const { rect: r } of sidewalks) {
                const inside =
                    mid.x >= r.x0 - size && mid.x <= r.x1 + size && mid.z >= r.z0 - size && mid.z <= r.z1 + size;
                if (!inside) continue;
                // Distance from the centre line to the sidewalk, across the road
                const gap = e.dx !== 0 ? Math.max(r.z0 - mid.z, mid.z - r.z1) : Math.max(r.x0 - mid.x, mid.x - r.x1);
                if (gap >= 0) {
                    expect(gap).toBeGreaterThanOrEqual(reach);
                }
            }
        }
    });
});
