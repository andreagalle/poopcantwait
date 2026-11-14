import { describe, expect, it } from 'vitest';

import { BENNY_CLIPS } from '../../config/tuning';

import { bennyClip } from './benny-clip';

const base = { knocked: false, accident: false, speedShare: 0, low: false };

describe('bennyClip', () => {
    it('stands when still or frozen in an accident, and lies down when knocked over', () => {
        expect(bennyClip(base).clip).toBe('idle');
        expect(bennyClip({ ...base, accident: true, speedShare: 1 }).clip).toBe('idle');
        expect(bennyClip({ ...base, knocked: true, speedShare: 1 }).clip).toBe('fall');
    });

    it('walks, then runs as he speeds up, and waddles whatever his speed on a low countdown', () => {
        expect(bennyClip({ ...base, speedShare: 0.3 }).clip).toBe('walk');
        expect(bennyClip({ ...base, speedShare: BENNY_CLIPS.runShare }).clip).toBe('run');
        expect(bennyClip({ ...base, speedShare: 1, low: true }).clip).toBe('waddle');
        expect(bennyClip({ ...base, speedShare: 0.3, low: true }).clip).toBe('waddle');
    });

    it('plays the clip faster the faster he goes, within its range', () => {
        const slow = bennyClip({ ...base, speedShare: 0.2 }).speed;
        const fast = bennyClip({ ...base, speedShare: 1 }).speed;
        expect(fast).toBeGreaterThan(slow);
        expect(fast).toBeCloseTo(BENNY_CLIPS.playbackSpeed.max);
        expect(bennyClip({ ...base, speedShare: 5 }).speed).toBeCloseTo(BENNY_CLIPS.playbackSpeed.max);
        expect(bennyClip({ ...base, speedShare: Number.NaN }).clip).toBe('idle');
    });
});
