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
