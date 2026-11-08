import { describe, expect, it } from 'vitest';

import { DIFFICULTY, KIOSKS } from '../../config/tuning';
import { Rng } from '../rng';

import type { KioskState } from './kiosks';
import { circleNearRect, initialKiosks, occupiedFactor, occupyAfterUse, tickKiosks } from './kiosks';

describe('kiosks', () => {
    it('start somewhere in their cycle, some free and some occupied', () => {
        const kiosks = initialKiosks(400, new Rng(1));
        const free = kiosks.filter((k) => k.status === 'free').length;
        // Free about 10 s out of 20 on average
        expect(free / kiosks.length).toBeGreaterThan(0.4);
        expect(free / kiosks.length).toBeLessThan(0.6);
        for (const k of kiosks) {
            const max = k.status === 'free' ? KIOSKS.freeSeconds.max : KIOSKS.occupiedSeconds.max;
            expect(k.secondsLeft).toBeGreaterThanOrEqual(0);
            expect(k.secondsLeft).toBeLessThanOrEqual(max);
        }
    });

    it('flip between free and occupied with durations from the design ranges', () => {
        const rng = new Rng(2);
        let kiosks: KioskState[] = [{ status: 'free', secondsLeft: 0.01 }];
        const durations = { free: [] as number[], occupied: [] as number[] };
        for (let i = 0; i < 200; i++) {
            const { kiosks: next, flipped } = tickKiosks(kiosks, 0.02, rng, 0);
            expect(flipped).toEqual([0]);
            durations[next[0].status].push(next[0].secondsLeft);
            kiosks = [{ ...next[0], secondsLeft: 0.01 }];
        }
        expect(Math.min(...durations.free)).toBeGreaterThanOrEqual(KIOSKS.freeSeconds.min);
        expect(Math.max(...durations.free)).toBeLessThanOrEqual(KIOSKS.freeSeconds.max);
        expect(Math.min(...durations.occupied)).toBeGreaterThanOrEqual(KIOSKS.occupiedSeconds.min);
        expect(Math.max(...durations.occupied)).toBeLessThanOrEqual(KIOSKS.occupiedSeconds.max);
    });

    it('only flips a kiosk when its time runs out', () => {
        const { kiosks, flipped } = tickKiosks([{ status: 'occupied', secondsLeft: 3 }], 1, new Rng(3), 0);
        expect(flipped).toEqual([]);
        expect(kiosks[0]).toEqual({ status: 'occupied', secondsLeft: 2 });
    });

    it('stays occupied longer as the run goes on, up to twice as long', () => {
        expect(occupiedFactor(0)).toBe(1);
        expect(occupiedFactor(60)).toBeCloseTo(1 + DIFFICULTY.kioskOccupiedGrowthPerMinute, 10);
        expect(occupiedFactor(3600)).toBe(DIFFICULTY.kioskOccupiedMaxFactor);
        expect(occupiedFactor(-5)).toBe(1);
        const late = tickKiosks([{ status: 'free', secondsLeft: 0 }], 0.1, new Rng(4), 3600).kiosks[0];
        expect(late.secondsLeft).toBeGreaterThanOrEqual(KIOSKS.occupiedSeconds.min * 2);
    });

    it('stays occupied for a while after Benny used it', () => {
        const used = occupyAfterUse(new Rng(5), 0);
        expect(used.status).toBe('occupied');
        expect(used.secondsLeft).toBeGreaterThanOrEqual(KIOSKS.occupiedAfterUseSeconds.min);
        expect(used.secondsLeft).toBeLessThanOrEqual(KIOSKS.occupiedAfterUseSeconds.max);
    });

    it('tells when Benny touches a door zone', () => {
        const door = { x0: 0, z0: 0, x1: 2, z1: 1.5 };
        expect(circleNearRect(1, 0.5, 0.45, door, 0)).toBe(true);
        expect(circleNearRect(1, -0.6, 0.45, door, 0.3)).toBe(true);
        expect(circleNearRect(1, -1, 0.45, door, 0.3)).toBe(false);
        expect(circleNearRect(5, 0.5, 3, door, 0.3)).toBe(true);
    });
});
