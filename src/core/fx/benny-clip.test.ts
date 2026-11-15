import { describe, expect, it } from 'vitest';

import { BENNY_CLIPS } from '../../config/tuning';

import { bennyClip } from './benny-clip';

const base = { knocked: false, accident: false, speed: 0 };

describe('bennyClip', () => {
    it('stands when still or frozen in an accident, and lies down when knocked over', () => {
        expect(bennyClip(base).clip).toBe('idle');
        expect(bennyClip({ ...base, speed: BENNY_CLIPS.moveMetresPerSecond / 2 }).clip).toBe('idle');
        expect(bennyClip({ ...base, accident: true, speed: 5 }).clip).toBe('idle');
        expect(bennyClip({ ...base, knocked: true, speed: 5 }).clip).toBe('fall');
    });

    it('walks at any speed, never runs', () => {
        for (const speed of [0.5, 2, 7]) {
            expect(bennyClip({ ...base, speed }).clip).toBe('walk');
        }
    });

    it('steps as fast as the ground goes by, so his feet do not slide, up to the cadence limit', () => {
        const ground = BENNY_CLIPS.walkMetresPerSecond;
        expect(bennyClip({ ...base, speed: 2 * ground }).speed).toBeCloseTo(2);
        expect(bennyClip({ ...base, speed: 3.5 }).speed * ground).toBeCloseTo(3.5);
        expect(bennyClip({ ...base, speed: 7 }).speed).toBe(BENNY_CLIPS.playbackSpeed.max);
        expect(bennyClip({ ...base, speed: 0.4 }).speed).toBe(BENNY_CLIPS.playbackSpeed.min);
    });

    it('treats a non-finite speed as standing', () => {
        expect(bennyClip({ ...base, speed: Number.NaN })).toEqual({ clip: 'idle', speed: 1 });
    });
});
