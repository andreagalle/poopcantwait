/**
 * A small deterministic hash of a few integers, to pick among looks (a roof, a window, a shop) without drawing random
 * numbers, so the seeded game stays the same.
 */
export function hashInts(...values: number[]): number {
    let h = 2166136261;
    for (const v of values) {
        h = Math.imul(h ^ (v & 0xffff), 16777619);
        h = Math.imul(h ^ (v >>> 16), 16777619);
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    return (h ^ (h >>> 15)) >>> 0;
}
