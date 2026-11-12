import { describe, expect, it } from 'vitest';

import { hasTouch, isTouchOnly } from './device';

/** A fake `matchMedia` that knows which pointers the device has. */
const device = (pointers: { coarse: boolean; fine: boolean }) => (query: string) =>
    (query === '(any-pointer: coarse)' && pointers.coarse) || (query === '(any-pointer: fine)' && pointers.fine);

describe('isTouchOnly', () => {
    it('is true for a phone or a tablet without a mouse', () => {
        expect(isTouchOnly(device({ coarse: true, fine: false }))).toBe(true);
    });

    it('is false for a computer, touchscreen laptops included', () => {
        expect(isTouchOnly(device({ coarse: false, fine: true }))).toBe(false);
        expect(isTouchOnly(device({ coarse: true, fine: true }))).toBe(false);
    });

    it('is false when the browser reports no pointer at all', () => {
        expect(isTouchOnly(device({ coarse: false, fine: false }))).toBe(false);
    });
});

describe('hasTouch', () => {
    it('is true for anything with a touchscreen, touchscreen laptops included', () => {
        expect(hasTouch(device({ coarse: true, fine: false }))).toBe(true);
        expect(hasTouch(device({ coarse: true, fine: true }))).toBe(true);
    });

    it('is false for a computer with only a mouse or a trackpad', () => {
        expect(hasTouch(device({ coarse: false, fine: true }))).toBe(false);
    });
});
