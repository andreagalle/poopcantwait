import { describe, expect, it } from 'vitest';

import { EFFECTS } from '../../config/tuning';
import { Rng } from '../rng';

import type { Puff } from './puffs';
import { burst, puffDiameter, stinkPuff, tickPuffs } from './puffs';

/** Runs puffs in 60 Hz steps for `seconds`, returning how many are left after each step. */
function survivors(puffs: Puff[], seconds: number): number[] {
    const counts: number[] = [];
    let live = puffs;
    for (let i = 0; i < Math.round(seconds * 60); i++) {
        live = tickPuffs(live, 1 / 60);
        counts.push(live.length);
    }
    return counts;
}

describe('puffs', () => {
    it('bursts the configured number of puffs out of a spot, all around it', () => {
        const puffs = burst('crumple', 10, -4, new Rng(1));
        expect(puffs).toHaveLength(EFFECTS.puffs.crumple.count);
        expect(puffs.every((p) => p.kind === 'smoke' && p.x === 10 && p.z === -4)).toBe(true);
        // Spread around the circle: some go left, some right, some up the screen, some down
        expect(puffs.some((p) => p.vx > 0.5)).toBe(true);
        expect(puffs.some((p) => p.vx < -0.5)).toBe(true);
        expect(puffs.some((p) => p.vz > 0.5)).toBe(true);
        expect(puffs.some((p) => p.vz < -0.5)).toBe(true);
    });

    it('uses crumbs for junk food, leaves for vegetables, dust when knocked over', () => {
        expect(burst('bite', 0, 0, new Rng(2))[0]!.kind).toBe('crumb');
        expect(burst('vegetable', 0, 0, new Rng(2))[0]!.kind).toBe('leaf');
        expect(burst('knocked', 0, 0, new Rng(2))[0]!.kind).toBe('dust');
    });

    it('can start from a given height, such as the top of a wreck', () => {
        expect(burst('crumple', 0, 0, new Rng(8), 2.5).every((p) => p.y === 2.5)).toBe(true);
    });

    it('is the same for the same seed', () => {
        expect(burst('bite', 1, 2, new Rng(7))).toEqual(burst('bite', 1, 2, new Rng(7)));
    });

    it('lets crumbs fall and smoke rise, and every puff disappears by the end of its life', () => {
        const crumbs = burst('bite', 0, 0, new Rng(3));
        const smoke = burst('crumple', 0, 0, new Rng(3));
        const later = (p: Puff[]) => tickPuffs(tickPuffs(p, 0.2), 0.05);
        expect(Math.min(...later(smoke).map((p) => p.y))).toBeGreaterThan(smoke[0]!.y);
        const counts = survivors(crumbs, EFFECTS.puffs.bite.lifeSeconds * 1.2);
        expect(counts.at(-1)).toBe(0);
        expect(survivors(smoke, EFFECTS.puffs.crumple.lifeSeconds * 1.2).at(-1)).toBe(0);
    });

    it('freezes when no time passes (the pause)', () => {
        const puffs = burst('crumple', 0, 0, new Rng(4));
        expect(tickPuffs(puffs, 0)).toEqual(puffs);
    });

    it('pops up to full size early and shrinks away to nothing', () => {
        const [p] = burst('crumple', 0, 0, new Rng(5));
        const at = (share: number) => puffDiameter({ ...p!, age: p!.lifeSeconds * share });
        expect(at(0)).toBe(0);
        expect(at(0.1)).toBeCloseTo(p!.size / 2);
        expect(at(0.2)).toBeCloseTo(p!.size);
        expect(at(0.6)).toBeLessThan(p!.size);
        expect(at(1)).toBe(0);
    });

    it('rises a stink cloud around Benny, thinner in the trail after an accident', () => {
        const rng = new Rng(6);
        const cloud = Array.from({ length: 50 }, () => stinkPuff(5, 5, 1, false, rng));
        const trail = Array.from({ length: 50 }, () => stinkPuff(5, 5, 1, true, rng));
        for (const p of cloud) {
            expect(Math.hypot(p.x - 5, p.z - 5)).toBeLessThanOrEqual(1 + 1e-9);
            expect(p.vy).toBeGreaterThan(0);
        }
        const mean = (ps: Puff[]) => ps.reduce((sum, p) => sum + p.size, 0) / ps.length;
        expect(mean(trail)).toBeLessThan(mean(cloud));
    });
});
