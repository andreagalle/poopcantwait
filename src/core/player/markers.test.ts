import { describe, expect, it } from 'vitest';

import { CITY, COLLISIONS, WEIGHT } from '../../config/tuning';

import { passed, weightMarkers } from './markers';
import { diameterAt, maxWeightFitting } from './weight';

describe('maxWeightFitting', () => {
    it('inverts the diameter formula', () => {
        for (const w of [0.1, 0.25, 0.5, 0.82, 0.99]) {
            expect(maxWeightFitting(diameterAt(w))).toBeCloseTo(w, 9);
        }
    });

    it('is 0 for gaps narrower than a slim Benny and 1 for gaps wider than a massive one', () => {
        expect(maxWeightFitting(WEIGHT.diameter.baseMetres / 2)).toBe(0);
        expect(maxWeightFitting(diameterAt(1) + 5)).toBe(1);
    });

    it('puts the alley and street limits where the girth tiers change (design: Weight, girth and speed)', () => {
        expect(maxWeightFitting(CITY.streetClasses.alley.widthMetres)).toBeCloseTo(WEIGHT.tiers[0].maxWeight, 2);
        expect(maxWeightFitting(CITY.streetClasses.street.widthMetres)).toBeCloseTo(WEIGHT.tiers[2].maxWeight, 2);
    });
});

describe('weightMarkers', () => {
    it('marks alleys, cars, streets and buses in order of weight', () => {
        const markers = weightMarkers();
        expect(markers.map((m) => m.id)).toEqual(['alleys', 'cars', 'streets', 'buses']);
        expect(markers.find((m) => m.id === 'cars')!.weight).toBe(COLLISIONS.crumpleWeightThreshold.car);
        expect(markers.find((m) => m.id === 'buses')!.weight).toBe(COLLISIONS.crumpleWeightThreshold.bus);
        expect(markers.filter((m) => m.kind === 'fit').map((m) => m.id)).toEqual(['alleys', 'streets']);
    });

    it('passes a fit marker once he is wider than the gap, and a crush marker at the threshold', () => {
        const [alleys, cars] = weightMarkers();
        expect(passed(alleys!, alleys!.weight)).toBe(false);
        expect(passed(alleys!, alleys!.weight + 0.001)).toBe(true);
        expect(passed(cars!, cars!.weight - 0.001)).toBe(false);
        expect(passed(cars!, cars!.weight)).toBe(true);
    });
});
