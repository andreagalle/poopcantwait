import { describe, expect, it } from 'vitest';

import type { Range } from './tuning';
import { CITY, FOOD, KIOSKS, POPUP_TOILETS, TRAFFIC, COLLISIONS, WEIGHT } from './tuning';

const isValidRange = (r: Range): boolean => Number.isFinite(r.min) && Number.isFinite(r.max) && r.min <= r.max;

describe('tuning', () => {
    it('has well-formed ranges', () => {
        const ranges: Range[] = [
            CITY.boulevardsPerAxis,
            KIOSKS.freeSeconds,
            KIOSKS.occupiedSeconds,
            KIOSKS.occupiedAfterUseSeconds,
            POPUP_TOILETS.spawnPathDistanceMetres,
            TRAFFIC.speedMetresPerSecond.car,
            TRAFFIC.speedMetresPerSecond.bus,
            COLLISIONS.stunSeconds
        ];
        for (const r of ranges) {
            expect(isValidRange(r)).toBe(true);
        }
    });

    it('orders street classes from narrowest to widest', () => {
        const widths = Object.values(CITY.streetClasses).map((c) => c.widthMetres);
        expect(widths).toEqual([...widths].sort((a, b) => a - b));
    });

    it('splits the weight range [0, 1] into contiguous girth tiers', () => {
        const bounds = WEIGHT.tiers.map((t) => t.maxWeight);
        expect(bounds).toEqual([...bounds].sort((a, b) => a - b));
        expect(bounds[0]).toBeGreaterThan(0);
        expect(bounds.at(-1)).toBe(1);
    });

    it('lists the 13 food items of the design', () => {
        expect(Object.keys(FOOD.junk)).toHaveLength(7);
        expect(Object.keys(FOOD.vegetables)).toHaveLength(6);
    });

    it('lets Benny reach maximum weight after roughly 35 to 45 junk food items', () => {
        const weights = Object.values(FOOD.junk).map((f) => f.weight);
        const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;
        const items = 1 / mean;
        expect(items).toBeGreaterThanOrEqual(35);
        expect(items).toBeLessThanOrEqual(45);
    });
});
