import { describe, expect, it } from 'vitest';

import { parseLaunchParams } from './params';

describe('parseLaunchParams', () => {
    it('defaults to a random seed and no debug aids', () => {
        expect(parseLaunchParams('')).toEqual({ seed: null, debug: false, weight: null, countdownSeconds: null });
    });

    it('reads the seed and the debug flag', () => {
        expect(parseLaunchParams('?seed=42&debug=1')).toEqual({
            seed: 42,
            debug: true,
            weight: null,
            countdownSeconds: null
        });
        expect(parseLaunchParams('?debug=true')).toEqual({
            seed: null,
            debug: true,
            weight: null,
            countdownSeconds: null
        });
        expect(parseLaunchParams('?seed=%2012%20')).toEqual({
            seed: 12,
            debug: false,
            weight: null,
            countdownSeconds: null
        });
    });

    it('wraps seeds into 32 bits', () => {
        expect(parseLaunchParams('?seed=-1').seed).toBe(4294967295);
        expect(parseLaunchParams('?seed=4294967301').seed).toBe(5);
    });

    it('reads a starting weight, capped at 1', () => {
        expect(parseLaunchParams('?weight=0.5').weight).toBe(0.5);
        expect(parseLaunchParams('?weight=.82').weight).toBe(0.82);
        expect(parseLaunchParams('?weight=1').weight).toBe(1);
        expect(parseLaunchParams('?weight=7').weight).toBe(1);
        expect(parseLaunchParams('?weight=0').weight).toBe(0);
    });

    it('reads a countdown length for testing, between 1 s and 10 minutes', () => {
        expect(parseLaunchParams('?countdown=5').countdownSeconds).toBe(5);
        expect(parseLaunchParams('?countdown=0.2').countdownSeconds).toBe(1);
        expect(parseLaunchParams('?countdown=9999').countdownSeconds).toBe(600);
        expect(parseLaunchParams('?countdown=soon').countdownSeconds).toBeNull();
    });

    it('ignores malformed values', () => {
        expect(parseLaunchParams('?weight=-0.5').weight).toBeNull();
        expect(parseLaunchParams('?weight=heavy').weight).toBeNull();
        expect(parseLaunchParams('?weight=').weight).toBeNull();
        expect(parseLaunchParams('?seed=abc').seed).toBeNull();
        expect(parseLaunchParams('?seed=1.5').seed).toBeNull();
        expect(parseLaunchParams('?seed=').seed).toBeNull();
        expect(parseLaunchParams('?seed=1234567890123456789').seed).toBeNull();
        expect(parseLaunchParams('?debug=0').debug).toBe(false);
        expect(parseLaunchParams('?debug').debug).toBe(false);
    });
});
