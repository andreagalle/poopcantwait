import { describe, expect, it } from 'vitest';

import { generateCity } from './city/generate';
import { Game } from './game';
import { overlapDepth } from './player/collision';
import { diameterAt } from './player/weight';
import { FixedStepper } from './sim/fixed-step';

/** The urgency and relief events only, leaving out the pop-up ones. */
const core = (events: readonly string[]) =>
    events.filter((e) => ['accident', 'accidentOver', 'gameOver', 'reliefStart', 'reliefEnd'].includes(e));

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
        expect(core(seen)).toEqual(['accident']);
        expect(game.urgency.cleanUnderpants).toBe(4);
        const frozenAt = game.player;
        for (let i = 0; i < 30; i++) {
            game.step({ x: 1, z: 0 });
        }
        expect(game.player.x).toBe(frozenAt.x);
        while (game.phase === 'accident') {
            game.step({ x: 1, z: 0 });
        }
        expect(core(game.drainEvents())).toEqual(['accidentOver']);
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
        expect(core(events).at(-1)).toBe('gameOver');
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
        expect(core(game.drainEvents())).toEqual(['reliefStart']);
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
        expect(core(game.drainEvents())).toEqual(['reliefEnd']);
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

describe('Game pop-up toilets', () => {
    const city = generateCity(31);

    it('spawns pop-ups on a timer, where Benny can go, and lets them sink after their lifetime', () => {
        const game = new Game(city, { weight: 1 });
        const events: string[] = [];
        // At maximum weight one comes every 6 s
        for (let i = 0; i < 60 * 7; i++) {
            game.step({ x: 0, z: 0 });
            events.push(...game.drainEvents());
        }
        expect(events).toContain('popupSpawned');
        expect(game.popups.length).toBeGreaterThan(0);
        const popup = game.popups[0];
        expect(city.nav.canStand(popup.x, popup.z, 7.5)).toBe(true);
        expect(game.toiletDistance({ kind: 'popup', id: popup.id })).toBeLessThan(200);
        // Lifetimes run out; never more than four at once
        for (let i = 0; i < 60 * 25; i++) {
            game.step({ x: 0, z: 0 });
            expect(game.popups.length).toBeLessThanOrEqual(4);
            events.push(...game.drainEvents());
        }
        expect(game.popups.find((p) => p.id === popup.id)).toBeUndefined();
        expect(events).toContain('popupGone');
    });

    it('applies the mercy rule once per countdown cycle when no free toilet is within reach', () => {
        const game = new Game(city, { countdownSeconds: 4 });
        for (let i = 0; i < game.kiosks.length; i++) {
            game.kiosks[i] = { status: 'occupied', secondsLeft: 1000 };
        }
        const events: string[] = [];
        for (let i = 0; i < 60 * 3; i++) {
            game.step({ x: 0, z: 0 });
            events.push(...game.drainEvents());
        }
        expect(events.filter((e) => e === 'mercy')).toHaveLength(1);
        const mercy = game.popups.at(-1)!;
        const distance = game.toiletDistance({ kind: 'popup', id: mercy.id });
        expect(distance).toBeLessThan(0.8 * 4 * 7);
    });

    it('lets Benny use a pop-up by stepping into it, and removes it', () => {
        const game = new Game(city);
        game.popups.push({ id: 99, x: game.player.x + 1, z: game.player.z, secondsLeft: 20 });
        let steps = 0;
        while (game.phase === 'playing' && steps < 120) {
            game.step({ x: 0, z: 0 });
            steps++;
        }
        expect(game.phase).toBe('relief');
        expect(game.relief?.toilet).toEqual({ kind: 'popup', id: 99 });
        expect(game.popups.find((p) => p.id === 99)).toBeUndefined();
        expect(game.toiletDistance({ kind: 'popup', id: 99 })).toBe(Infinity);
    });

    it("measures the way to every free toilet at Benny's girth", () => {
        const slim = new Game(city);
        const massive = new Game(city, { weight: 1 });
        const kiosks = city.kioskSpots.map((_, index) => ({ kind: 'kiosk', index }) as const);
        const reachable = (g: Game) => kiosks.filter((k) => Number.isFinite(g.toiletDistance(k))).length;
        // A slim Benny reaches more kiosks than a massive one, who cannot fit the streets
        expect(reachable(slim)).toBeGreaterThan(reachable(massive));
        expect(slim.freeToilets().every((t) => t.kind === 'kiosk' || t.kind === 'popup')).toBe(true);
    });
});

describe('Game weight', () => {
    const city = generateCity(42);

    it('grows Benny, up to the maximum, and reports girth tier changes', () => {
        const game = new Game(city);
        game.addWeight(0.2);
        expect(game.player.weight).toBeCloseTo(0.2, 10);
        expect(game.drainEvents()).not.toContain('tierChanged');
        game.addWeight(0.1);
        expect(game.drainEvents()).toContain('tierChanged');
        game.addWeight(5);
        expect(game.player.weight).toBe(1);
        game.addWeight(-1);
        expect(game.player.weight).toBe(1);
    });

    it('squeezes him out of an alley he no longer fits, along the alley rather than through a wall', () => {
        const alley = city.alleys.find((a) => a.to - a.from >= 20)!;
        const middle = (alley.from + alley.to) / 2;
        const inside = alley.axis === 'z' ? { x: alley.centre, z: middle } : { x: middle, z: alley.centre };
        const game = new Game(city, { weight: 0.2 });
        game.player = { ...game.player, ...inside, vx: 0, vz: 0 };
        game.addWeight(0.1);
        const { x, z } = game.player;
        expect(game.drainEvents()).toContain('squeezed');
        expect(overlapDepth(game.world, x, z, diameterAt(game.player.weight) / 2)).toBe(0);
        // Out at one end of the alley, on the road it opens onto
        const along = alley.axis === 'z' ? z : x;
        const across = alley.axis === 'z' ? x : z;
        expect(Math.abs(across - alley.centre)).toBeLessThan(4);
        expect(along <= alley.from + 1 || along >= alley.to - 1).toBe(true);
        // And he can move again
        game.step({ x: 1, z: 0 });
        game.step({ x: 1, z: 0 });
        game.step({ x: 0, z: 1 });
        expect(Math.hypot(game.player.x - x, game.player.z - z)).toBeGreaterThan(0);
    });

    it('leaves him where he is when he still fits', () => {
        const game = new Game(city);
        const before = game.player;
        game.addWeight(0.05);
        expect(game.player.x).toBe(before.x);
        expect(game.player.z).toBe(before.z);
        expect(game.drainEvents()).not.toContain('squeezed');
    });
});

describe('NavGrid.nearestRoomy', () => {
    const city = generateCity(42);

    it('finds the nearest roomy cell through open ground only', () => {
        const spot = city.nav.nearestRoomy(city.spawn, 0.9)!;
        expect(spot).toEqual(city.spawn);
        const wide = city.nav.nearestRoomy(city.spawn, 7.5)!;
        expect(city.nav.clearanceAt(wide.x, wide.z)).toBeGreaterThan(3.75);
        expect(city.nav.nearestRoomy({ x: 9999, z: 0 }, 1)).toBeNull();
        expect(city.nav.nearestRoomy(city.spawn, 500)).toBeNull();
    });
});

describe('Game food', () => {
    const city = generateCity(42);

    it('spawns food near Benny on a timer, up to the cap, and lets it fade', () => {
        const game = new Game(city);
        for (let i = 0; i < 60 * 12; i++) {
            game.step({ x: 0, z: 0 });
        }
        expect(game.food.length).toBeGreaterThanOrEqual(8);
        expect(game.food.length).toBeLessThanOrEqual(25);
        for (const item of game.food) {
            expect(Math.hypot(item.x - game.player.x, item.z - game.player.z)).toBeLessThanOrEqual(41);
        }
        const first = game.food[0].id;
        for (let i = 0; i < 60 * 31; i++) {
            game.step({ x: 0, z: 0 });
            expect(game.food.length).toBeLessThanOrEqual(25);
        }
        expect(game.food.find((f) => f.id === first)).toBeUndefined();
    });

    it('fattens Benny with junk food and costs him seconds with vegetables', () => {
        const game = new Game(city);
        game.food.push({
            id: 1001,
            kind: { category: 'junk', id: 'burger' },
            x: game.player.x + 0.5,
            z: game.player.z,
            secondsLeft: 10
        });
        game.step({ x: 0, z: 0 });
        expect(game.player.weight).toBeCloseTo(0.035, 10);
        expect(game.drainEvents()).toContain('ateJunk');
        expect(game.drainEaten()).toEqual([
            { kind: { category: 'junk', id: 'burger' }, x: game.player.x + 0.5, z: game.player.z }
        ]);

        const before = game.urgency.secondsLeft;
        game.food.push({
            id: 1002,
            kind: { category: 'vegetable', id: 'beans' },
            x: game.player.x,
            z: game.player.z + 0.5,
            secondsLeft: 10
        });
        game.step({ x: 0, z: 0 });
        expect(game.urgency.secondsLeft).toBeCloseTo(before - 10 - game.stepSeconds, 6);
        expect(game.drainEvents()).toContain('ateVegetable');
        expect(game.food.find((f) => f.id >= 1001)).toBeUndefined();
    });

    it('does not eat while frozen in an accident', () => {
        const game = new Game(city, { countdownSeconds: 1 });
        while (game.phase !== 'accident') {
            game.step({ x: 0, z: 0 });
        }
        game.food.push({
            id: 2001,
            kind: { category: 'junk', id: 'donut' },
            x: game.player.x,
            z: game.player.z,
            secondsLeft: 10
        });
        game.step({ x: 0, z: 0 });
        expect(game.food.find((f) => f.id === 2001)).toBeDefined();
        expect(game.player.weight).toBe(0);
    });
});

describe('Game score', () => {
    const city = generateCity(42);

    it('scores junk food with the combo, and relief with the clutch bonus', () => {
        const game = new Game(city);
        const at = (dx: number) => ({ x: game.player.x + dx, z: game.player.z });
        game.food.push({ id: 3001, kind: { category: 'junk', id: 'burger' }, ...at(0.5), secondsLeft: 10 });
        game.step({ x: 0, z: 0 });
        game.food.push({ id: 3002, kind: { category: 'junk', id: 'fries' }, ...at(-0.5), secondsLeft: 10 });
        game.step({ x: 0, z: 0 });
        // 100 for the burger, then 50 × 1.5 for the fries within the combo window
        expect(game.score.points).toBe(175);
        expect(game.score.multiplier).toBe(1.5);
        expect(game.drainGains().map((g) => g.points)).toEqual([100, 75]);

        // A free toilet right here: relief scores 250 plus 20 per second left
        game.popups.push({ id: 77, x: game.player.x, z: game.player.z + 1, secondsLeft: 20 });
        while (game.phase === 'playing') {
            game.step({ x: 0, z: 0 });
        }
        const [relief] = game.drainGains();
        expect(relief.points).toBeGreaterThan(250 + 20 * 39);
        expect(relief.points).toBeLessThanOrEqual(250 + 20 * 40);
        expect(game.score.points).toBe(175 + relief.points);
    });

    it('lets the combo run out after three seconds', () => {
        const game = new Game(city);
        game.food.push({
            id: 4001,
            kind: { category: 'junk', id: 'donut' },
            x: game.player.x,
            z: game.player.z + 0.5,
            secondsLeft: 10
        });
        game.step({ x: 0, z: 0 });
        for (let i = 0; i < 60 * 3 + 2; i++) {
            game.step({ x: 0, z: 0 });
        }
        expect(game.score.multiplier).toBe(1);
        expect(game.score.comboSecondsLeft).toBe(0);
    });
});
