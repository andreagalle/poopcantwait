import { describe, expect, it } from 'vitest';

import { TRAFFIC } from '../../config/tuning';
import { generateCity } from '../city/generate';
import { Rng } from '../rng';

import { buildLaneGraph, lanePosition } from './lanes';
import { turnBetween, turnPose } from './turns';
import type { Vehicle } from './vehicles';
import { driveVehicle, followSpeed, gapsAhead, spawnVehicle, vehicleFootprint, vehiclePose } from './vehicles';

describe('turns', () => {
    const city = generateCity(42);
    const graph = buildLaneGraph(city);

    it('round a corner on a quarter circle, leaving and joining the lanes in line', () => {
        const a = graph.edges.findIndex((e) => e.dx === 1);
        const ea = graph.edges[a];
        for (const b of graph.nodes[ea.to].edges.filter((e) => graph.edges[e].dz !== 0)) {
            const eb = graph.edges[b];
            const turn = turnBetween(graph, a, b);
            const end = turnPose(turn, turn.length);
            // Right-hand traffic: heading +x with z growing to the right, a turn to +z is a right turn
            const right = eb.dz * ea.dx > 0;
            const radius = right ? TRAFFIC.turnRadiusMetres.right : TRAFFIC.turnRadiusMetres.left;
            expect(turn.length).toBeCloseTo((Math.PI / 2) * radius, 1);
            // It starts on the lane of a, heading along it, and ends on the lane of b, heading along that
            const start = turnPose(turn, 0);
            const onA = lanePosition(graph, a, turn.exit);
            expect(Math.hypot(start.x - onA.x, start.z - onA.z)).toBeLessThan(1e-9);
            expect(start.dx).toBeCloseTo(ea.dx, 6);
            const onB = lanePosition(graph, b, turn.entry);
            expect(Math.hypot(end.x - onB.x, end.z - onB.z)).toBeLessThan(1e-9);
            expect(end.dz).toBeCloseTo(eb.dz, 6);
        }
    });

    it('go straight on in lane, at an even pace', () => {
        const a = graph.edges.findIndex((e) => {
            const on = graph.nodes[e.to].edges.find((n) => graph.edges[n].dx === e.dx && graph.edges[n].dz === e.dz);
            return on !== undefined && graph.edges[on].streetClass === e.streetClass;
        });
        const ea = graph.edges[a];
        const b = graph.nodes[ea.to].edges.find((n) => graph.edges[n].dx === ea.dx && graph.edges[n].dz === ea.dz)!;
        const turn = turnBetween(graph, a, b);
        const radius = TRAFFIC.turnRadiusMetres.left;
        expect(turn.length).toBeCloseTo(2 * radius, 6);
        expect(turn.exit).toBeCloseTo(ea.length - radius, 9);
        expect(turn.entry).toBeCloseTo(radius, 9);
        const middle = turnPose(turn, radius);
        const node = lanePosition(graph, a, ea.length);
        expect(Math.hypot(middle.x - node.x, middle.z - node.z)).toBeLessThan(1e-6);
    });

    it('never let a vehicle jump, snap round or change pace, through two minutes of driving', () => {
        const rng = new Rng(9);
        for (const type of ['car', 'bus'] as const) {
            let v = spawnVehicle(graph, 1, type, rng, city.spawn, 45)!;
            // Skip the first edge: it joined somewhere along it
            while (v.t > 0.5 || v.t < 0) {
                v = driveVehicle(graph, v, 1 / 60, rng);
                if (v.t < 20) break;
            }
            let pose = vehiclePose(graph, v);
            const dt = 1 / 60;
            let turns = 0;
            for (let i = 0; i < 60 * 120; i++) {
                const next = driveVehicle(graph, v, dt, rng);
                const after = vehiclePose(graph, next);
                const step = Math.hypot(after.x - pose.x, after.z - pose.z);
                expect(step).toBeLessThanOrEqual(v.speed * dt * 1.01);
                expect(step).toBeGreaterThanOrEqual(v.speed * dt * 0.97);
                const turn = Math.acos(Math.min(1, after.dx * pose.dx + after.dz * pose.dz));
                // The sharpest a vehicle turns is its speed over the radius
                expect(turn).toBeLessThanOrEqual((v.speed * dt * 1.05) / TRAFFIC.turnRadiusMetres.right + 1e-9);
                if (next.edge !== v.edge && graph.edges[next.edge].dx !== graph.edges[v.edge].dx) {
                    turns++;
                }
                v = next;
                pose = after;
            }
            expect(turns).toBeGreaterThan(3);
        }
    });

    it('have a footprint that turns with them', () => {
        const v = { ...spawnVehicle(graph, 1, 'car', new Rng(1), city.spawn, 45)! };
        const diagonal = vehicleFootprint(v, { x: 0, z: 0, dx: Math.SQRT1_2, dz: Math.SQRT1_2 });
        const { length, width } = TRAFFIC.size.car;
        expect(diagonal.x1 - diagonal.x0).toBeCloseTo((length + width) * Math.SQRT1_2, 9);
        expect(diagonal.z1 - diagonal.z0).toBeCloseTo((length + width) * Math.SQRT1_2, 9);
    });
});

describe('vehicles in a lane', () => {
    const city = generateCity(42);
    const graph = buildLaneGraph(city);
    const edge = graph.edges.findIndex((e) => e.length > 60 && e.streetClass !== 'street');
    const next = graph.nodes[graph.edges[edge].to].edges.find((n) => n !== graph.edges[edge].reverse)!;
    const vehicle = (id: number, t: number, speed: number): Vehicle => ({
        id,
        type: 'car' as const,
        edge,
        t,
        next,
        speed,
        wreckSecondsLeft: 0,
        honkCooldown: 0
    });

    it('keep their distance: a fast car behind a slow one slows down to its pace and never runs into it', () => {
        const rng = new Rng(4);
        let vehicles = [vehicle(1, 0, 14), vehicle(2, 15, 9)];
        const dt = 1 / 60;
        for (let i = 0; i < 60 * 3; i++) {
            const gaps = gapsAhead(graph, vehicles);
            expect(gaps[0]).toBeGreaterThan(0);
            vehicles = vehicles.map((v, k) => driveVehicle(graph, v, dt, rng, followSpeed(v.speed, gaps[k])));
        }
        const gap = gapsAhead(graph, vehicles)[0];
        // Settled one second of driving behind it, plus the standing gap
        expect(gap).toBeCloseTo(TRAFFIC.followGapMetres + 9 * TRAFFIC.followHeadwaySeconds, 0);
        expect(gapsAhead(graph, vehicles)[1]).toBe(Infinity);
    });

    it('queue behind a wreck, standing the gap away from it', () => {
        const rng = new Rng(5);
        let vehicles = [vehicle(1, 0, 12), { ...vehicle(2, 40, 0), wreckSecondsLeft: 100 }];
        for (let i = 0; i < 60 * 8; i++) {
            const gaps = gapsAhead(graph, vehicles);
            vehicles = vehicles.map((v, k) => driveVehicle(graph, v, 1 / 60, rng, followSpeed(v.speed, gaps[k])));
        }
        expect(gapsAhead(graph, vehicles)[0]).toBeCloseTo(TRAFFIC.followGapMetres, 1);
        expect(followSpeed(12, gapsAhead(graph, vehicles)[0])).toBeLessThan(0.1);
    });

    it('see the vehicle ahead on the edge they turn into', () => {
        const turn = turnBetween(graph, edge, next);
        const behind = vehicle(1, turn.exit, 10);
        const ahead = { ...vehicle(2, turn.entry + 10, 10), edge: next, next: edge };
        const gap = gapsAhead(graph, [behind, ahead])[0];
        expect(gap).toBeCloseTo(turn.length + 10 - TRAFFIC.size.car.length, 6);
    });

    it('drive at their cruising speed on a clear road, and stop when the gap is gone', () => {
        expect(followSpeed(11, Infinity)).toBe(11);
        expect(followSpeed(11, TRAFFIC.followGapMetres)).toBe(0);
        expect(followSpeed(11, -3)).toBe(0);
    });
});
