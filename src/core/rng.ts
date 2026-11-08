/**
 * Seeded pseudo-random number generator. Every random decision in the game goes through an `Rng`, so a run is fully
 * determined by its seed (`?seed=<n>`) and the player's input.
 *
 * The generator is sfc32 (small fast counting, 128-bit state), seeded through splitmix32 so that nearby seeds give
 * unrelated sequences. It is not cryptographically secure, and does not need to be.
 */

/** Advances a splitmix32 state and returns the next 32-bit output and state. */
function splitmix32(state: number): { value: number; state: number } {
    const next = (state + 0x9e3779b9) | 0;
    let z = next;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    z ^= z >>> 16;
    return { value: z >>> 0, state: next };
}

/** Turns any finite number into a 32-bit unsigned seed. Integers in `[0, 2^32)` map to themselves. */
export function normalizeSeed(seed: number): number {
    if (!Number.isFinite(seed)) {
        throw new RangeError(`seed must be a finite number, got ${seed}`);
    }
    return Math.trunc(seed) >>> 0;
}

export class Rng {
    /** The normalized seed this generator was created with. */
    readonly seed: number;

    private a: number;
    private b: number;
    private c: number;
    private d: number;

    /** Creates a generator; equal seeds give equal sequences. */
    constructor(seed: number) {
        this.seed = normalizeSeed(seed);
        let s = this.seed;
        const words: number[] = [];
        for (let i = 0; i < 4; i++) {
            const out = splitmix32(s);
            words.push(out.value);
            s = out.state;
        }
        this.a = words[0]!;
        this.b = words[1]!;
        this.c = words[2]!;
        this.d = words[3]!;
        // Discard the first outputs: sfc32 mixes its state over its first few rounds
        for (let i = 0; i < 12; i++) {
            this.nextUint32();
        }
    }

    /** Next raw 32-bit unsigned integer. */
    nextUint32(): number {
        const t = (((this.a + this.b) | 0) + this.d) | 0;
        this.d = (this.d + 1) | 0;
        this.a = this.b ^ (this.b >>> 9);
        this.b = (this.c + (this.c << 3)) | 0;
        this.c = (this.c << 21) | (this.c >>> 11);
        this.c = (this.c + t) | 0;
        return t >>> 0;
    }

    /** Uniform float in `[0, 1)`. */
    next(): number {
        return this.nextUint32() / 4294967296;
    }

    /** Uniform float in `[min, max)`. */
    range(min: number, max: number): number {
        if (!(min <= max)) {
            throw new RangeError(`range needs min <= max, got ${min} and ${max}`);
        }
        return min + (max - min) * this.next();
    }

    /** Uniform integer in `[min, max]`, both inclusive. */
    int(min: number, max: number): number {
        if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
            throw new RangeError(`int needs integers with min <= max, got ${min} and ${max}`);
        }
        return min + Math.floor(this.next() * (max - min + 1));
    }

    /** `true` with probability `p` (clamped to `[0, 1]`). */
    chance(p: number): boolean {
        return this.next() < p;
    }

    /** A uniformly chosen element of a non-empty array. */
    pick<T>(items: readonly T[]): T {
        if (items.length === 0) {
            throw new RangeError('pick needs a non-empty array');
        }
        return items[this.int(0, items.length - 1)]!;
    }

    /** Shuffles `items` in place (Fisher-Yates) and returns it. */
    shuffle<T>(items: T[]): T[] {
        for (let i = items.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            [items[i], items[j]] = [items[j]!, items[i]!];
        }
        return items;
    }

    /**
     * A new, independent generator seeded from this one. Give each system its own fork, so that extra draws in one
     * system (say, traffic) do not change the sequence another one sees (say, food).
     */
    fork(): Rng {
        return new Rng(this.nextUint32());
    }
}
