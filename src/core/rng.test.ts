import { describe, expect, it } from 'vitest';

import { normalizeSeed, Rng } from './rng';

const draws = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.next());

describe('normalizeSeed', () => {
    it('keeps 32-bit unsigned integers unchanged', () => {
        expect(normalizeSeed(0)).toBe(0);
        expect(normalizeSeed(42)).toBe(42);
        expect(normalizeSeed(4294967295)).toBe(4294967295);
    });

    it('truncates fractions and wraps other integers into 32 bits', () => {
        expect(normalizeSeed(7.9)).toBe(7);
        expect(normalizeSeed(-1)).toBe(4294967295);
        expect(normalizeSeed(4294967296 + 5)).toBe(5);
    });

    it('rejects values that are not finite', () => {
        expect(() => normalizeSeed(Number.NaN)).toThrow(RangeError);
        expect(() => normalizeSeed(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    });
});

describe('Rng', () => {
    it('is deterministic per seed', () => {
        for (const seed of [0, 1, 7, 123456789, 4294967295]) {
            expect(draws(new Rng(seed), 100)).toEqual(draws(new Rng(seed), 100));
        }
    });

    it('gives unrelated sequences for neighbouring seeds', () => {
        const a = draws(new Rng(1), 100);
        const b = draws(new Rng(2), 100);
        const equal = a.filter((value, i) => value === b[i]).length;
        expect(equal).toBe(0);
    });

    it('records the normalized seed', () => {
        expect(new Rng(-1).seed).toBe(4294967295);
    });

    it('draws floats in [0, 1) with a roughly uniform spread', () => {
        const rng = new Rng(2024);
        const buckets = new Array<number>(10).fill(0);
        const n = 100_000;
        for (let i = 0; i < n; i++) {
            const x = rng.next();
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(1);
            buckets[Math.floor(x * 10)]!++;
        }
        for (const count of buckets) {
            expect(count / n).toBeGreaterThan(0.095);
            expect(count / n).toBeLessThan(0.105);
        }
    });

    it('draws 32-bit unsigned integers', () => {
        const rng = new Rng(9);
        for (let i = 0; i < 1000; i++) {
            const x = rng.nextUint32();
            expect(Number.isInteger(x)).toBe(true);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(4294967295);
        }
    });

    it('keeps range() inside [min, max)', () => {
        const rng = new Rng(5);
        for (let i = 0; i < 1000; i++) {
            const x = rng.range(6, 14);
            expect(x).toBeGreaterThanOrEqual(6);
            expect(x).toBeLessThan(14);
        }
        expect(rng.range(3, 3)).toBe(3);
        expect(() => rng.range(2, 1)).toThrow(RangeError);
        expect(() => rng.range(Number.NaN, 1)).toThrow(RangeError);
    });

    it('draws every integer of int() bounds, inclusive, and nothing outside', () => {
        const rng = new Rng(11);
        const seen = new Set<number>();
        for (let i = 0; i < 2000; i++) {
            const x = rng.int(-2, 3);
            expect(Number.isInteger(x)).toBe(true);
            seen.add(x);
        }
        expect([...seen].sort((p, q) => p - q)).toEqual([-2, -1, 0, 1, 2, 3]);
        expect(rng.int(4, 4)).toBe(4);
    });

    it('rejects invalid int() bounds', () => {
        const rng = new Rng(1);
        expect(() => rng.int(3, 2)).toThrow(RangeError);
        expect(() => rng.int(0.5, 2)).toThrow(RangeError);
        expect(() => rng.int(0, 2.5)).toThrow(RangeError);
    });

    it('honours chance() extremes and frequency', () => {
        const rng = new Rng(3);
        const n = 20_000;
        let hits = 0;
        for (let i = 0; i < n; i++) {
            expect(rng.chance(0)).toBe(false);
            expect(rng.chance(1)).toBe(true);
            if (rng.chance(0.2)) {
                hits++;
            }
        }
        expect(hits / n).toBeGreaterThan(0.18);
        expect(hits / n).toBeLessThan(0.22);
    });

    it('picks every element of a list and rejects an empty one', () => {
        const rng = new Rng(8);
        const items = ['burger', 'fries', 'donut'] as const;
        const seen = new Set<string>();
        for (let i = 0; i < 200; i++) {
            seen.add(rng.pick(items));
        }
        expect(seen).toEqual(new Set(items));
        expect(() => rng.pick([])).toThrow(RangeError);
    });

    it('shuffles in place into a permutation, deterministically', () => {
        const original = Array.from({ length: 20 }, (_, i) => i);
        const a = new Rng(77).shuffle([...original]);
        const b = new Rng(77).shuffle([...original]);
        expect(a).toEqual(b);
        expect([...a].sort((p, q) => p - q)).toEqual(original);
        expect(a).not.toEqual(original);

        const list = [1, 2, 3];
        expect(new Rng(1).shuffle(list)).toBe(list);
        expect(new Rng(1).shuffle([])).toEqual([]);
    });

    it('forks independent, reproducible streams', () => {
        const parentA = new Rng(500);
        const parentB = new Rng(500);
        const forkA = parentA.fork();
        const forkB = parentB.fork();
        expect(draws(forkA, 50)).toEqual(draws(forkB, 50));

        // Extra draws in one fork do not change what the parent or a sibling fork produce next
        const parentC = new Rng(500);
        const forkC = parentC.fork();
        draws(forkC, 1000);
        expect(draws(parentC, 20)).toEqual(draws(parentA, 20));

        expect(draws(new Rng(500).fork(), 20)).not.toEqual(draws(new Rng(500), 20));
    });
});
