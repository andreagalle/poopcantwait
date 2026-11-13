/**
 * Whether the device offers only coarse pointers, such as a phone or a tablet without a mouse: then there is no
 * keyboard to expect, and the screens speak of taps and drags instead of keys (design: *Controls*). A touchscreen
 * laptop also has a fine pointer, so it counts as a computer. `matches` answers a CSS media query.
 */
export function isTouchOnly(matches: (query: string) => boolean): boolean {
    return matches('(any-pointer: coarse)') && !matches('(any-pointer: fine)');
}

/** Whether the device has a touchscreen at all (a phone, a tablet, a touchscreen laptop): it gets the touch buttons. */
export function hasTouch(matches: (query: string) => boolean): boolean {
    return matches('(any-pointer: coarse)');
}

/** Answers a media query in this browser; false where media queries are not available. */
function mediaMatches(query: string): boolean {
    const matchMedia = globalThis.matchMedia;
    return typeof matchMedia === 'function' && matchMedia.call(globalThis, query).matches;
}

/** `isTouchOnly` for this browser. */
export function touchOnlyDevice(): boolean {
    return isTouchOnly(mediaMatches);
}

/** `hasTouch` for this browser. */
export function touchDevice(): boolean {
    return hasTouch(mediaMatches);
}
