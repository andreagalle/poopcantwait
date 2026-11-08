import { describe, expect, it } from 'vitest';

import { generateCity } from './city/generate';
import { Game } from './game';
import { overlapDepth } from './player/collision';
import { diameterAt } from './player/weight';
import { FixedStepper } from './sim/fixed-step';

describe('FixedStepper', () => {
    it('runs whole steps and carries the remainder', () => {
        const stepper = new FixedStepper(0.1, 5);
        expect(stepper.advance(0.25)).toBe(2);
        expect(stepper.alpha).toBeCloseTo(0.5, 10);
        expect(stepper.advance(0.06)).toBe(1);
        expect(stepper.alpha).toBeCloseTo(0.1, 10);
        expect(stepper.advance(-1)).toBe(0);
    });

    it('drops time beyond the step cap instead of fast-forwarding', () => {
        const stepper = new FixedStepper(0.1, 3);
        expect(stepper.advance(2)).toBe(3);
        expect(stepper.alpha).toBe(0);
    });

    it('rejects nonsense settings', () => {
        expect(() => new FixedStepper(0, 1)).toThrow(RangeError);
        expect(() => new FixedStepper(0.1, 0)).toThrow(RangeError);
    });
});

describe('Game', () => {
    const city = generateCity(7);

    it('starts a slim Benny at the spawn point, standing still', () => {
        const game = new Game(city);
        expect(Math.hypot(game.player.x - city.spawn.x, game.player.z - city.spawn.z)).toBeLessThan(1.5);
        expect(game.player.vx).toBe(0);
        expect(game.player.weight).toBe(0);
        expect(game.previousPlayer).toBe(game.player);
    });

    it('places a heavy Benny where he fits', () => {
        for (const weight of [0.5, 0.9, 1]) {
            const game = new Game(city, { weight });
            expect(overlapDepth(game.world, game.player.x, game.player.z, diameterAt(weight) / 2)).toBe(0);
            expect(game.player.weight).toBe(weight);
        }
        expect(new Game(city, { weight: 3 }).player.weight).toBe(1);
    });

    it('advances time and keeps the previous state for interpolation', () => {
        const game = new Game(city);
        game.step({ x: 1, z: 0 });
        game.step({ x: 1, z: 0 });
        expect(game.time).toBeCloseTo(2 * game.stepSeconds, 12);
        expect(game.player.x).toBeGreaterThan(game.previousPlayer.x);
    });

    it('replays identically from the same seed and inputs', () => {
        const inputs = Array.from({ length: 300 }, (_, i) => ({ x: Math.sin(i / 20), z: Math.cos(i / 31) }));
        const a = new Game(generateCity(99));
        const b = new Game(generateCity(99));
        for (const input of inputs) {
            a.step(input);
            b.step(input);
        }
        expect(a.player).toEqual(b.player);
    });
});

describe('NavGrid.nearestStandable', () => {
    const city = generateCity(3);

    it('returns the point itself when Benny fits there', () => {
        const spot = city.nav.nearestStandable(city.spawn, 0.9);
        expect(spot).toEqual(city.spawn);
    });

    it('finds the nearest roomy spot for a wide Benny, and nothing when nothing is wide enough', () => {
        const spot = city.nav.nearestStandable(city.spawn, 7.5)!;
        expect(city.nav.clearanceAt(spot.x, spot.z)).toBeGreaterThan(3.75);
        expect(city.nav.nearestStandable(city.spawn, 100)).toBeNull();
    });
});

describe('Game phases', () => {
    const city = generateCity(11);

    it('freezes Benny during an accident and resumes afterwards', () => {
        const game = new Game(city, { countdownSeconds: 1 });
        const seen: string[] = [];
        while (game.phase !== 'accident') {
            game.step({ x: 0, z: 0 });
            seen.push(...game.drainEvents());
        }
        expect(seen).toEqual(['accident']);
        expect(game.urgency.cleanUnderpants).toBe(4);
        const frozenAt = game.player;
        for (let i = 0; i < 30; i++) {
            game.step({ x: 1, z: 0 });
        }
        expect(game.player.x).toBe(frozenAt.x);
        while (game.phase === 'accident') {
            game.step({ x: 1, z: 0 });
        }
        expect(game.drainEvents()).toEqual(['accidentOver']);
        game.step({ x: 1, z: 0 });
        game.step({ x: 1, z: 0 });
        expect(game.player.x).toBeGreaterThan(frozenAt.x);
    });

    it('ends the run after five accidents and stops there', () => {
        const game = new Game(city, { countdownSeconds: 1 });
        const events: string[] = [];
        for (let i = 0; i < 60 * 20 && game.phase !== 'over'; i++) {
            game.step({ x: 0, z: 0 });
            events.push(...game.drainEvents());
        }
        expect(game.phase).toBe('over');
        expect(events.filter((e) => e === 'accident')).toHaveLength(5);
        expect(events.at(-1)).toBe('gameOver');
        const at = game.time;
        game.step({ x: 1, z: 0 });
        expect(game.time).toBe(at);
        expect(game.drainEvents()).toEqual([]);
    });
});

describe('Game toilets', () => {
    const city = generateCity(21);
    /** Puts a slim Benny right in front of a kiosk door, touching the facade. */
    const atDoor = (game: Game, index: number) => {
        const spot = city.kioskSpots[index];
        const radius = 0.45;
        const doorX = (spot.rect.x0 + spot.rect.x1) / 2 + spot.facing.x * (1 + radius + 0.05);
        const doorZ = (spot.rect.z0 + spot.rect.z1) / 2 + spot.facing.z * (1 + radius + 0.05);
        game.player = { ...game.player, x: doorX, z: doorZ, vx: 0, vz: 0 };
    };

    it('starts the kiosks in a mix of free and occupied, from the seed', () => {
        const a = new Game(city);
        const b = new Game(city);
        expect(a.kiosks).toHaveLength(city.kioskSpots.length);
        expect(a.kiosks).toEqual(b.kiosks);
    });

    it('relieves Benny after half a second at the door of a free kiosk', () => {
        const game = new Game(city);
        game.kiosks[0] = { status: 'free', secondsLeft: 100 };
        // Most of the countdown spent
        for (let i = 0; i < 60 * 30; i++) {
            game.step({ x: 0, z: 0 });
        }
        game.drainEvents();
        atDoor(game, 0);
        let steps = 0;
        while (game.phase === 'playing' && steps < 120) {
            game.step({ x: 0, z: 0 });
            steps++;
        }
        expect(game.phase).toBe('relief');
        expect(steps * game.stepSeconds).toBeCloseTo(0.5, 1);
        expect(game.drainEvents()).toEqual(['reliefStart']);
        expect(game.kiosks[0].status).toBe('occupied');

        // He cannot move during the relief, and the countdown holds
        const held = game.urgency.secondsLeft;
        const where = game.player;
        for (let i = 0; i < 30; i++) {
            game.step({ x: 1, z: 0 });
        }
        expect(game.player.x).toBe(where.x);
        expect(game.urgency.secondsLeft).toBe(held);

        while (game.phase === 'relief') {
            game.step({ x: 0, z: 0 });
        }
        expect(game.drainEvents()).toEqual(['reliefEnd']);
        expect(game.urgency.secondsLeft).toBe(game.urgency.countdownSeconds);
        expect(game.phase).toBe('playing');
    });

    it('waits at an occupied kiosk until it frees up, then uses it', () => {
        const game = new Game(city);
        game.kiosks[1] = { status: 'occupied', secondsLeft: 1 };
        atDoor(game, 1);
        game.step({ x: 0, z: 0 });
        expect(game.waitingAt).toBe(1);
        expect(game.dwell).toBeNull();
        let steps = 0;
        while (game.phase === 'playing' && steps < 300) {
            game.step({ x: 0, z: 0 });
            steps++;
        }
        expect(game.phase).toBe('relief');
        expect(game.waitingAt).toBeNull();
        expect(steps * game.stepSeconds).toBeGreaterThan(1);
    });

    it('forgets the dwell when Benny walks away from the door', () => {
        const game = new Game(city);
        game.kiosks[2] = { status: 'free', secondsLeft: 100 };
        atDoor(game, 2);
        for (let i = 0; i < 10; i++) {
            game.step({ x: 0, z: 0 });
        }
        expect(game.dwell?.seconds).toBeGreaterThan(0.1);
        game.player = { ...game.player, x: city.spawn.x, z: city.spawn.z };
        game.step({ x: 0, z: 0 });
        expect(game.dwell).toBeNull();
        expect(game.phase).toBe('playing');
    });
});
