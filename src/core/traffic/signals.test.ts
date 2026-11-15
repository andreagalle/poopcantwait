import { describe, expect, it } from 'vitest';

import { CITY, TRAFFIC } from '../../config/tuning';
import { generateCity } from '../city/generate';
import { Rng } from '../rng';

import { buildLaneGraph } from './lanes';
import { armLayout } from './markings';
import { cycleSeconds, lightAt, signalGap, signalsOf } from './signals';
import type { Vehicle } from './vehicles';
import { driveVehicle, followSpeed, gapsAhead } from './vehicles';

describe('traffic lights', () => {
    const city = generateCity(42);
    const graph = buildLaneGraph(city);
    const signals = signalsOf(graph);
    const byNode = new Map(signals.map((s) => [s.node, s]));
    const { greenSeconds, amberSeconds, allRedSeconds } = TRAFFIC.signals;
    /** A signalled crossing with a long arm coming into it along x. */
    const intoX = signals
        .map((signal) => ({
            signal,
            edge: graph.edges.findIndex((e) => e.to === signal.node && e.dx !== 0 && e.length > 30)
        }))
        .find((a) => a.edge >= 0)!;

    it('stand where avenues and boulevards cross, and only there', () => {
        expect(signals.length).toBeGreaterThan(3);
        for (const s of signals) {
            const classes = graph.nodes[s.node].edges.map((e) => graph.edges[e]);
            const major = classes.filter((e) => e.streetClass !== 'street');
            expect(major.some((e) => e.dx !== 0) && major.some((e) => e.dz !== 0)).toBe(true);
        }
    });

    it('give each axis green, amber and red in turn, never green both ways', () => {
        const signal = { node: 0, offset: 0 };
        expect(lightAt(signal, 'x', 0)).toBe('green');
        expect(lightAt(signal, 'z', 0)).toBe('red');
        expect(lightAt(signal, 'x', greenSeconds + 0.1)).toBe('amber');
        expect(lightAt(signal, 'x', greenSeconds + amberSeconds + 0.1)).toBe('red');
        expect(lightAt(signal, 'z', greenSeconds + amberSeconds + allRedSeconds + 0.1)).toBe('green');
        for (let t = 0; t < 2 * cycleSeconds(); t += 0.25) {
            expect(lightAt(signal, 'x', t) === 'green' && lightAt(signal, 'z', t) === 'green').toBe(false);
        }
    });

    it('stop a car at the line on red, and let it go on green', () => {
        const { signal, edge } = intoX;
        const node = signal.node;
        const e = graph.edges[edge];
        const next = graph.nodes[node].edges.find((n) => n !== e.reverse)!;
        // A time when the x axis is red: half a cycle after its green
        let time = 0;
        while (lightAt(signal, 'x', time) !== 'red') time += 0.5;
        let car: Vehicle = { id: 1, type: 'car', edge, t: 2, next, speed: 12, wreckSecondsLeft: 0, honkCooldown: 0 };
        const rng = new Rng(1);
        const map = new Map([[node, signal]]);
        for (let i = 0; i < 60 * 4 && lightAt(signal, 'x', time) === 'red'; i++) {
            const gap = Math.min(gapsAhead(graph, [car])[0], signalGap(graph, map, car, time));
            car = driveVehicle(graph, car, 1 / 60, rng, followSpeed(car.speed, gap));
            time += 1 / 60;
        }
        const line = armLayout(graph, node, e.reverse).stop + CITY.roadMarkings.stopLine.depthMetres;
        const front = e.length - car.t - TRAFFIC.size.car.length / 2;
        expect(car.edge).toBe(edge);
        expect(front).toBeGreaterThanOrEqual(line - 0.01);
        // Then green: it drives on through the crossing
        while (lightAt(signal, 'x', time) !== 'green') time += 0.5;
        for (let i = 0; i < 60 * 6; i++) {
            const gap = Math.min(gapsAhead(graph, [car])[0], signalGap(graph, map, car, time));
            car = driveVehicle(graph, car, 1 / 60, rng, followSpeed(car.speed, gap));
            time += 1 / 60;
        }
        expect(car.edge).not.toBe(edge);
    });

    it('let a car too close to stop drive through on amber', () => {
        const { signal, edge } = intoX;
        const e = graph.edges[edge];
        const line = armLayout(graph, signal.node, e.reverse).stop + CITY.roadMarkings.stopLine.depthMetres;
        let time = 0;
        while (lightAt(signal, 'x', time) !== 'amber') time += 0.25;
        const at = (toLine: number): Vehicle => ({
            id: 1,
            type: 'car',
            edge,
            t: e.length - TRAFFIC.size.car.length / 2 - line - toLine,
            next: e.reverse,
            speed: 12,
            wreckSecondsLeft: 0,
            honkCooldown: 0
        });
        const map = new Map([[signal.node, signal]]);
        expect(signalGap(graph, map, at(2), time)).toBe(Infinity);
        expect(signalGap(graph, map, at(20), time)).toBeCloseTo(20 + TRAFFIC.followGapMetres, 6);
    });

    it('come out the same for the same city', () => {
        expect(signalsOf(buildLaneGraph(generateCity(42)))).toEqual(signals);
        expect(byNode.size).toBe(signals.length);
    });
});
