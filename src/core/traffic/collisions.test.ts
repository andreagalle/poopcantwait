import { describe, expect, it } from 'vitest';

import { COLLISIONS } from '../../config/tuning';

import { hitOutcome, knockSpeed } from './collisions';

describe('vehicle collisions', () => {
    it('crumple a car at or above weight 0.5 and a bus at or above 0.85', () => {
        expect(hitOutcome('car', 0.5)).toEqual({ kind: 'crumple' });
        expect(hitOutcome('car', 0.49).kind).toBe('knocked');
        expect(hitOutcome('bus', 0.85)).toEqual({ kind: 'crumple' });
        expect(hitOutcome('bus', 0.6).kind).toBe('knocked');
        expect(hitOutcome('bus', 3)).toEqual({ kind: 'crumple' });
    });

    it('knock a slim Benny back the full distance, and a fatter one less, never stunning under the minimum', () => {
        const slim = hitOutcome('car', 0);
        expect(slim).toEqual({
            kind: 'knocked',
            distance: COLLISIONS.knockBackMaxMetres,
            stunSeconds: COLLISIONS.stunSeconds.max
        });
        const chubby = hitOutcome('car', 0.25);
        expect(chubby.kind === 'knocked' && chubby.distance).toBeCloseTo(4, 10);
        expect(chubby.kind === 'knocked' && chubby.stunSeconds).toBeCloseTo(0.6, 10);
        const almost = hitOutcome('car', 0.45);
        expect(almost.kind === 'knocked' && almost.stunSeconds).toBe(COLLISIONS.stunSeconds.min);
    });

    it('turn a knock-back distance into a speed that braking soaks up over exactly that distance', () => {
        const rate = 40;
        const v = knockSpeed(8, rate);
        expect((v * v) / (2 * rate)).toBeCloseTo(8, 10);
        expect(knockSpeed(-2, rate)).toBe(0);
    });
});
