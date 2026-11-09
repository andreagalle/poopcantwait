import { describe, expect, it } from 'vitest';

import { EFFECTS } from '../../config/tuning';

import { addTrauma, decayTrauma, shakeOffset, traumaFor } from './shake';
import type { SquashInput } from './squash';
import { decayEatPulse, squashPose, stridePhaseDelta } from './squash';

const still: SquashInput = { stridePhase: 0, speedShare: 0, time: 0, nervous: false, eatPulse: 0 };

describe('camera shake', () => {
    it('shakes for hits and accidents, not for eating or honks', () => {
        expect(traumaFor('knocked')).toBe(EFFECTS.shake.trauma.knocked);
        expect(traumaFor('crumple')).toBe(EFFECTS.shake.trauma.crumple);
        expect(traumaFor('accident')).toBe(EFFECTS.shake.trauma.accident);
        expect(traumaFor('ateJunk')).toBe(0);
        expect(traumaFor('honk')).toBe(0);
    });

    it('caps trauma at 1 and drains it at a steady rate', () => {
        expect(addTrauma(0.8, 0.75)).toBe(1);
        expect(addTrauma(0, 0.4)).toBe(0.4);
        expect(decayTrauma(1, 0.25)).toBeCloseTo(1 - EFFECTS.shake.decayPerSecond * 0.25);
        expect(decayTrauma(0.1, 10)).toBe(0);
    });

    it('stays still without trauma and within the trauma-squared amplitude with it', () => {
        expect(shakeOffset(0, 1.234)).toEqual({ x: 0, y: 0, z: 0 });
        for (const trauma of [0.3, 0.7, 1]) {
            const limit = EFFECTS.shake.maxOffsetMetres * trauma * trauma + 1e-9;
            let largest = 0;
            for (let t = 0; t < 2; t += 0.004) {
                const o = shakeOffset(trauma, t);
                expect(Math.abs(o.x)).toBeLessThanOrEqual(limit);
                expect(Math.abs(o.y)).toBeLessThanOrEqual(limit);
                expect(Math.abs(o.z)).toBeLessThanOrEqual(limit);
                largest = Math.max(largest, Math.abs(o.x));
            }
            // It actually moves, by most of the allowed amplitude
            expect(largest).toBeGreaterThan(limit * 0.6);
        }
    });

    it('is the same every time (no random numbers)', () => {
        expect(shakeOffset(0.8, 0.5)).toEqual(shakeOffset(0.8, 0.5));
    });
});

describe('squash and stretch', () => {
    it('keeps the volume of the plush: width scale is the inverse square root of the height scale', () => {
        for (let phase = 0; phase < 7; phase += 0.37) {
            const pose = squashPose({ ...still, stridePhase: phase, speedShare: 1, time: phase, eatPulse: 0.5 });
            expect(pose.sxz * pose.sxz * pose.sy).toBeCloseTo(1, 9);
        }
    });

    it('hops once per footstep at full speed: stretched in the air, squashed on landing', () => {
        const apex = squashPose({ ...still, stridePhase: Math.PI / 2, speedShare: 1 });
        const landing = squashPose({ ...still, stridePhase: Math.PI, speedShare: 1 });
        expect(apex.sy).toBeCloseTo(1 + EFFECTS.squash.runAmplitude);
        expect(apex.lift).toBeCloseTo(EFFECTS.squash.hopMetres);
        expect(landing.sy).toBeCloseTo(1 - EFFECTS.squash.runAmplitude);
        expect(landing.lift).toBeCloseTo(0);
        // The waddle swings to one side, then to the other on the next step
        const left = squashPose({ ...still, stridePhase: Math.PI / 2, speedShare: 1 }).rollDegrees;
        const right = squashPose({ ...still, stridePhase: (3 * Math.PI) / 2, speedShare: 1 }).rollDegrees;
        expect(left).toBeCloseTo(EFFECTS.squash.waddleDegrees);
        expect(right).toBeCloseTo(-EFFECTS.squash.waddleDegrees);
    });

    it('only breathes when standing still', () => {
        let lowest = Infinity;
        let highest = -Infinity;
        for (let t = 0; t < 2; t += 0.01) {
            const pose = squashPose({ ...still, time: t });
            expect(pose.lift).toBe(0);
            expect(pose.rollDegrees).toBe(0);
            lowest = Math.min(lowest, pose.sy);
            highest = Math.max(highest, pose.sy);
        }
        expect(highest - 1).toBeCloseTo(EFFECTS.squash.idle.amplitude, 2);
        expect(1 - lowest).toBeCloseTo(EFFECTS.squash.idle.amplitude, 2);
    });

    it('jiggles more when the countdown is low', () => {
        const swing = (nervous: boolean) => {
            let range = 0;
            for (let t = 0; t < 1; t += 0.005) {
                range = Math.max(range, Math.abs(squashPose({ ...still, time: t, nervous }).sy - 1));
            }
            return range;
        };
        expect(swing(true)).toBeGreaterThan(swing(false));
    });

    it('stretches up on a bite and settles back', () => {
        const mid = squashPose({ ...still, time: 0, eatPulse: 0.5 });
        expect(mid.sy).toBeCloseTo(1 + EFFECTS.squash.eat.stretch);
        expect(squashPose({ ...still, eatPulse: 1 }).sy).toBeCloseTo(1);
        expect(decayEatPulse(1, EFFECTS.squash.eat.seconds / 2)).toBeCloseTo(0.5);
        expect(decayEatPulse(0.1, 1)).toBe(0);
    });

    it('never squashes or stretches past the limits', () => {
        const pose = squashPose({ stridePhase: Math.PI / 2, speedShare: 5, time: 0.03, nervous: true, eatPulse: 0.5 });
        expect(pose.sy).toBeLessThanOrEqual(EFFECTS.squash.limits.max);
        expect(pose.sy).toBeGreaterThanOrEqual(EFFECTS.squash.limits.min);
    });

    it('takes longer steps when heavy', () => {
        expect(stridePhaseDelta(EFFECTS.squash.stepMetres.slim, 0)).toBeCloseTo(Math.PI);
        expect(stridePhaseDelta(EFFECTS.squash.stepMetres.heavy, 1)).toBeCloseTo(Math.PI);
        expect(stridePhaseDelta(1, 1)).toBeLessThan(stridePhaseDelta(1, 0));
        expect(stridePhaseDelta(-1, 0)).toBe(0);
    });
});
