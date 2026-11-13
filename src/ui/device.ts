/**
 * Whether the device offers only coarse pointers, such as a phone or a tablet without a mouse: then there is no
 * keyboard to expect, and the game cannot be played yet (design: *Controls*). A touchscreen laptop also has a fine
 * pointer, so it counts as a computer. `matches` answers a CSS media query.
 */
export function isTouchOnly(matches: (query: string) => boolean): boolean {
    return matches('(any-pointer: coarse)') && !matches('(any-pointer: fine)');
}

/** `isTouchOnly` for this browser; false where media queries are not available. */
export function touchOnlyDevice(): boolean {
    const matchMedia = globalThis.matchMedia;
    return typeof matchMedia === 'function' && isTouchOnly((query) => matchMedia.call(globalThis, query).matches);
}
