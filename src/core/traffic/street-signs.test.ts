import { describe, expect, it } from 'vitest';

import { generateCity } from '../city/generate';
import { sidewalksOf } from '../city/sidewalks';

import { buildLaneGraph } from './lanes';
import { signalsOf } from './signals';
import { placeStreetSigns } from './street-signs';

describe('street signs', () => {
    for (const seed of [5, 42]) {
        const city = generateCity(seed);
        const graph = buildLaneGraph(city);
        const signals = new Map(signalsOf(graph).map((s) => [s.node, s]));
        const sidewalks = sidewalksOf(city).map((s) => s.rect);
        const signs = placeStreetSigns(graph, sidewalks, signals);

        it(`put traffic lights at the signalled crossings and signs at the others, seed ${seed}`, () => {
            const kinds = new Set(signs.map((s) => s.kind));
            expect([...kinds].sort()).toEqual(['crossing', 'give-way', 'speed-30', 'stop', 'traffic-light']);
            for (const s of signs.filter((x) => x.kind === 'traffic-light')) {
                expect(signals.has(s.light!.node)).toBe(true);
            }
            // Most signalled crossings get a light on every arm
            const lit = new Set(signs.filter((s) => s.light).map((s) => s.light!.node));
            expect(lit.size).toBeGreaterThanOrEqual(signals.size - 1);
        });

        it(`stand on a sidewalk, facing along a road, clear of the street furniture, seed ${seed}`, () => {
            for (const s of signs) {
                expect(sidewalks.some((r) => s.x >= r.x0 && s.x <= r.x1 && s.z >= r.z0 && s.z <= r.z1)).toBe(true);
                expect(Math.abs(s.facing.x) + Math.abs(s.facing.z)).toBe(1);
                for (const p of city.props) {
                    expect(Math.hypot(p.x - s.x, p.z - s.z), JSON.stringify({ s, p })).toBeGreaterThan(0.5);
                }
            }
        });
    }
});
