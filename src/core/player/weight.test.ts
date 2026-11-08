import { describe, expect, it } from 'vitest';

import { BENNY, CITY, WEIGHT } from '../../config/tuning';

import { accelerationScaleAt, diameterAt, girthTierAt, heightScaleAt, topSpeedAt } from './weight';

describe('weight model', () => {
    it('matches the design formulas at both ends', () => {
        expect(diameterAt(0)).toBeCloseTo(0.9, 10);
        expect(diameterAt(1)).toBeCloseTo(7.5, 10);
        expect(topSpeedAt(0)).toBeCloseTo(7, 10);
        expect(topSpeedAt(1)).toBeCloseTo(2.1, 10);
        expect(accelerationScaleAt(0)).toBe(1);
        expect(accelerationScaleAt(1)).toBeCloseTo(0.4, 10);
        expect(heightScaleAt(0)).toBe(1);
        expect(heightScaleAt(1)).toBe(BENNY.maxHeightScale);
    });

    it('grows wider and slower monotonically', () => {
        for (let w = 0; w < 1; w += 0.05) {
            expect(diameterAt(w + 0.05)).toBeGreaterThan(diameterAt(w));
            expect(topSpeedAt(w + 0.05)).toBeLessThan(topSpeedAt(w));
        }
    });

    it('clamps weights outside [0, 1]', () => {
        expect(diameterAt(-1)).toBe(diameterAt(0));
        expect(topSpeedAt(2)).toBe(topSpeedAt(1));
        expect(accelerationScaleAt(5)).toBe(accelerationScaleAt(1));
        expect(girthTierAt(-0.5)).toBe('slim');
        expect(girthTierAt(3)).toBe('massive');
    });

    it('names the girth tiers at their boundaries', () => {
        expect(girthTierAt(0)).toBe('slim');
        expect(girthTierAt(0.25)).toBe('slim');
        expect(girthTierAt(0.26)).toBe('chubby');
        expect(girthTierAt(0.5)).toBe('chubby');
        expect(girthTierAt(0.51)).toBe('round');
        expect(girthTierAt(0.82)).toBe('round');
        expect(girthTierAt(0.83)).toBe('massive');
    });

    it('puts the tier boundaries where alleys and streets stop fitting (design table)', () => {
        const alley = CITY.streetClasses.alley.widthMetres;
        const street = CITY.streetClasses.street.widthMetres;
        const avenue = CITY.streetClasses.avenue.widthMetres;
        const [slim, , round] = WEIGHT.tiers;
        // Benny fits a road when his diameter is smaller than its width
        expect(diameterAt(slim.maxWeight)).toBeLessThan(alley);
        expect(diameterAt(slim.maxWeight + 0.01)).toBeGreaterThanOrEqual(alley);
        expect(diameterAt(round.maxWeight)).toBeLessThan(street);
        expect(diameterAt(round.maxWeight + 0.01)).toBeGreaterThanOrEqual(street);
        expect(diameterAt(1)).toBeLessThan(avenue);
    });
});
