import { describe, expect, it } from 'vitest';

import { parseLaunchParams } from './params';

describe('parseLaunchParams', () => {
    it('defaults to a random seed and no debug aids', () => {
        expect(parseLaunchParams('')).toEqual({ seed: null, debug: false });
    });

    it('reads the seed and the debug flag', () => {
        expect(parseLaunchParams('?seed=42&debug=1')).toEqual({ seed: 42, debug: true });
        expect(parseLaunchParams('?debug=true')).toEqual({ seed: null, debug: true });
        expect(parseLaunchParams('?seed=%2012%20')).toEqual({ seed: 12, debug: false });
    });

    it('wraps seeds into 32 bits', () => {
        expect(parseLaunchParams('?seed=-1').seed).toBe(4294967295);
        expect(parseLaunchParams('?seed=4294967301').seed).toBe(5);
    });

    it('ignores malformed values', () => {
        expect(parseLaunchParams('?seed=abc').seed).toBeNull();
        expect(parseLaunchParams('?seed=1.5').seed).toBeNull();
        expect(parseLaunchParams('?seed=').seed).toBeNull();
        expect(parseLaunchParams('?seed=1234567890123456789').seed).toBeNull();
        expect(parseLaunchParams('?debug=0').debug).toBe(false);
        expect(parseLaunchParams('?debug').debug).toBe(false);
    });
});
