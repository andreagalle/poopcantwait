import { describe, expect, it } from 'vitest';

import { CITY, TRAFFIC } from '../../config/tuning';
import { generateCity } from '../city/generate';
import { ZONE } from '../city/types';
import { Rng } from '../rng';

import { buildLaneGraph, busAllowed, laneOffset, lanePosition } from './lanes';
import { densityFactorAt, driveVehicle, spawnVehicle, targetCounts, vehicleFootprint, vehiclePose } from './vehicles';

describe('lane graph', () => {
    const city = generateCity(42);
    const graph = buildLaneGraph(city);

    it('links every stretch of street, avenue and boulevard both ways, never alleys', () => {
        expect(graph.edges.length).toBeGreaterThan(100);
        graph.edges.forEach((e, i) => {
            expect(graph.edges[e.reverse].reverse).toBe(i);
            expect(graph.edges[e.reverse].from).toBe(e.to);
            expect(e.length).toBeGreaterThan(0);
            expect(Math.abs(e.dx) + Math.abs(e.dz)).toBe(1);
            expect(e.streetClass).not.toBe('alley');
            expect(graph.nodes[e.from].edges).toContain(i);
        });
    });

    it('keeps every lane on its road, on the right of the direction of travel', () => {
        graph.edges.forEach((e, i) => {
            for (const share of [0.1, 0.5, 0.9]) {
                const p = lanePosition(graph, i, e.length * share);
                expect(city.nav.zoneAt(p.x, p.z)).not.toBe(ZONE.blocked);
                expect(city.nav.zoneAt(p.x, p.z)).not.toBe(ZONE.alley);
            }
        });
        // Driving right (+x), the lane is below the centre line on screen (+z)
        const east = graph.edges.findIndex((e) => e.dx === 1);
        const start = graph.nodes[graph.edges[east].from];
        expect(lanePosition(graph, east, 0).z - start.z).toBe(laneOffset(graph.edges[east].streetClass));
    });

    it('lets buses drive on avenues and boulevards only', () => {
        expect(busAllowed('street')).toBe(false);
        expect(busAllowed('avenue')).toBe(true);
        expect(busAllowed('boulevard')).toBe(true);
    });
});

describe('vehicles', () => {
    const city = generateCity(42);
    const graph = buildLaneGraph(city);

    it('grow in number 15% a minute, up to three times', () => {
        expect(densityFactorAt(0)).toBe(1);
        expect(densityFactorAt(120)).toBeCloseTo(1.3, 10);
        expect(densityFactorAt(3600)).toBe(TRAFFIC.maxDensityFactor);
        expect(targetCounts(0)).toEqual({ car: 12, bus: 3 });
        expect(targetCounts(3600)).toEqual({ car: 36, bus: 9 });
    });

    it('spawn away from Benny, on lanes they may use, at their cruising speed', () => {
        const rng = new Rng(1);
        for (let i = 0; i < 50; i++) {
            const bus = spawnVehicle(graph, i, 'bus', rng, city.spawn, 45)!;
            expect(busAllowed(graph.edges[bus.edge].streetClass)).toBe(true);
            const p = vehiclePose(graph, bus);
            expect(Math.hypot(p.x - city.spawn.x, p.z - city.spawn.z)).toBeGreaterThanOrEqual(45);
            expect(bus.speed).toBeGreaterThanOrEqual(TRAFFIC.speedMetresPerSecond.bus.min);
            expect(bus.speed).toBeLessThanOrEqual(TRAFFIC.speedMetresPerSecond.bus.max);
        }
        expect(spawnVehicle(graph, 99, 'car', rng, city.spawn, 100_000)).toBeNull();
    });

    it('drive along the network, picking turns, buses staying on wide roads', () => {
        const rng = new Rng(2);
        let car = spawnVehicle(graph, 1, 'car', rng, city.spawn, 45)!;
        let bus = spawnVehicle(graph, 2, 'bus', rng, city.spawn, 45)!;
        const carEdges = new Set<number>();
        for (let i = 0; i < 60 * 120; i++) {
            car = driveVehicle(graph, car, 1 / 60, rng);
            bus = driveVehicle(graph, bus, 1 / 60, rng);
            carEdges.add(car.edge);
            expect(busAllowed(graph.edges[bus.edge].streetClass)).toBe(true);
            const p = vehiclePose(graph, car);
            expect(city.nav.zoneAt(p.x, p.z)).not.toBe(ZONE.blocked);
        }
        // Two minutes of driving visit many stretches, streets included
        expect(carEdges.size).toBeGreaterThan(20);
        expect([...carEdges].some((e) => graph.edges[e].streetClass === 'street')).toBe(true);
    });

    it('leave wrecks where they are until they disappear', () => {
        const rng = new Rng(3);
        const wreck = { ...spawnVehicle(graph, 1, 'car', rng, city.spawn, 45)!, wreckSecondsLeft: 2 };
        const later = driveVehicle(graph, wreck, 1, rng);
        expect(later.t).toBe(wreck.t);
        expect(later.wreckSecondsLeft).toBe(1);
    });

    it('have a footprint along their direction, squashed when crumpled', () => {
        const v = { id: 1, type: 'car' as const, edge: 0, t: 0, speed: 10, wreckSecondsLeft: 0, honkCooldown: 0 };
        const along = vehicleFootprint(v, { x: 0, z: 0, dx: 1, dz: 0 });
        expect(along.x1 - along.x0).toBeCloseTo(TRAFFIC.size.car.length, 10);
        expect(along.z1 - along.z0).toBeCloseTo(TRAFFIC.size.car.width, 10);
        const squashed = vehicleFootprint(v, { x: 0, z: 0, dx: 0, dz: -1 }, 0.4);
        expect(squashed.z1 - squashed.z0).toBeCloseTo(TRAFFIC.size.car.length * 0.4, 10);
        expect(CITY.streetClasses.street.cars).toBe(true);
    });
});
