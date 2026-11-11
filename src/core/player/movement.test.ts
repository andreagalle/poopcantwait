import { describe, expect, it } from 'vitest';

import { MOVEMENT, SIMULATION } from '../../config/tuning';
import { generateCity } from '../city/generate';
import { Game } from '../game';

import type { CollisionWorld } from './collision';
import { overlapDepth } from './collision';
import type { MoveInput, PlayerState } from './movement';
import { stepPlayer, wrapAngle } from './movement';
import { diameterAt, topSpeedAt } from './weight';

const DT = 1 / SIMULATION.stepsPerSecond;
const OPEN: CollisionWorld = { halfSize: 1000, rects: [], circles: [], cells: new Map() };
const still = (weight = 0): PlayerState => ({ x: 0, z: 0, vx: 0, vz: 0, heading: 0, weight });

function run(state: PlayerState, input: MoveInput, seconds: number, world = OPEN): PlayerState {
    let s = state;
    for (let i = 0; i < Math.round(seconds / DT); i++) {
        s = stepPlayer(s, input, world, DT);
    }
    return s;
}

describe('stepPlayer', () => {
    it('accelerates to top speed and no further', () => {
        const s = run(still(), { x: 1, z: 0 }, 2);
        expect(s.vx).toBeCloseTo(topSpeedAt(0), 6);
        expect(s.vz).toBe(0);
        expect(s.x).toBeGreaterThan(10);
    });

    it('takes longer to get going when heavy', () => {
        const light = run(still(0), { x: 1, z: 0 }, 0.1);
        const heavy = run(still(1), { x: 1, z: 0 }, 0.1);
        expect(light.vx).toBeCloseTo(MOVEMENT.accelerationMetresPerSecond2 * 0.1, 0);
        expect(heavy.vx).toBeLessThan(light.vx * 0.5);
        expect(run(still(1), { x: 1, z: 0 }, 3).vx).toBeCloseTo(topSpeedAt(1), 6);
    });

    it('moves diagonally at top speed, not faster', () => {
        const s = run(still(), { x: 1, z: 1 }, 2);
        expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(topSpeedAt(0), 6);
        expect(s.vx).toBeCloseTo(s.vz, 10);
    });

    it('brakes to a stop when no key is held', () => {
        const running = run(still(), { x: 0, z: -1 }, 1);
        const stopped = run(running, { x: 0, z: 0 }, 1);
        expect(stopped.vx).toBe(0);
        expect(stopped.vz).toBe(0);
        const brakingTime = topSpeedAt(0) / MOVEMENT.brakingMetresPerSecond2;
        const coasting = run(running, { x: 0, z: 0 }, brakingTime / 2);
        expect(Math.abs(coasting.vz)).toBeGreaterThan(0);
    });

    it('turns to face the direction of travel at a limited rate', () => {
        let s = still();
        s = stepPlayer({ ...s, vx: 5 }, { x: 1, z: 0 }, OPEN, DT);
        const maxTurn = ((MOVEMENT.turnDegreesPerSecond * Math.PI) / 180) * DT;
        expect(s.heading).toBeCloseTo(maxTurn, 10);
        s = run(s, { x: 1, z: 0 }, 1);
        expect(s.heading).toBeCloseTo(Math.PI / 2, 6);
        s = run(s, { x: -1, z: 0 }, 2);
        expect(Math.abs(s.heading)).toBeCloseTo(Math.PI / 2, 6);
        expect(s.vx).toBeLessThan(0);
    });

    it('slides along a wall instead of stopping dead', () => {
        const wall: CollisionWorld = {
            halfSize: 1000,
            rects: [{ x0: -100, z0: -100, x1: 100, z1: -1 }],
            circles: [],
            cells: new Map(
                [-2, -1, 0, 1, 2].flatMap((cx) =>
                    [-2, -1, 0].map((cz) => [(cx + 1024) * 4096 + (cz + 1024), { rects: [0], circles: [] }])
                )
            )
        };
        // Running up and to the right into a wall above
        const s = run(still(), { x: 1, z: -1 }, 1, wall);
        expect(s.z).toBeCloseTo(-1 + diameterAt(0) / 2, 3);
        expect(s.x).toBeGreaterThan(3);
        expect(s.vz).toBeCloseTo(0, 6);
    });

    it('wraps angles into (-π, π]', () => {
        expect(wrapAngle(0)).toBe(0);
        expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 10);
        expect(wrapAngle(-Math.PI)).toBe(Math.PI);
        expect(wrapAngle((-3 * Math.PI) / 2)).toBeCloseTo(Math.PI / 2, 10);
    });
});

describe('Benny in a generated city', () => {
    const city = generateCity(42);

    it('runs down an alley when slim and cannot enter it when chubby', () => {
        const alley = city.alleys.find((a) => a.to - a.from >= 20)!;
        const along = alley.axis === 'z' ? { x: 0, z: 1 } : { x: 1, z: 0 };
        const entry =
            alley.axis === 'z' ? { x: alley.centre, z: alley.from - 2 } : { x: alley.from - 2, z: alley.centre };
        const middle = (alley.from + alley.to) / 2;
        const progress = (s: PlayerState) => (alley.axis === 'z' ? s.z : s.x);

        const slim = run({ ...entry, vx: 0, vz: 0, heading: 0, weight: 0 }, along, 6, new Game(city).world);
        expect(progress(slim)).toBeGreaterThan(middle);

        const chubby = run({ ...entry, vx: 0, vz: 0, heading: 0, weight: 0.4 }, along, 6, new Game(city).world);
        expect(progress(chubby)).toBeLessThan(alley.from);
    });

    it('never ends a step overlapping a wall, whatever the weight', () => {
        for (const weight of [0, 0.3, 0.6, 0.9, 1]) {
            // Movement only: the Game picks the start spot and the collision world
            const game = new Game(city, { weight });
            const directions: MoveInput[] = [
                { x: 1, z: 0 },
                { x: 0, z: 1 },
                { x: -1, z: -1 },
                { x: 0, z: -1 },
                { x: -1, z: 0.5 }
            ];
            let state = game.player;
            const radius = diameterAt(weight) / 2;
            for (const direction of directions) {
                for (let i = 0; i < 240; i++) {
                    state = stepPlayer(state, direction, game.world, DT);
                    expect(overlapDepth(game.world, state.x, state.z, radius)).toBeLessThan(1e-3);
                }
            }
            expect(city.nav.clearanceAt(state.x, state.z)).toBeGreaterThan(radius - 1);
        }
    });
});
