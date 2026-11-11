import { EFFECTS } from '../../config/tuning';
import { clampWeight } from '../player/weight';

/**
 * Benny's procedural squash and stretch (design: *The protagonist*: "a procedural squash-and-stretch layer on top of
 * the clips gives the plush feel"). It is pure presentation: the views feed it what they see and apply the pose to his
 * body; collision and the simulation never read it.
 */

export interface SquashInput {
    /** Footstep phase in radians: it grows by π per footstep (see `stridePhaseDelta`). */
    readonly stridePhase: number;
    /** Speed as a share of his top speed, 0 to 1. */
    readonly speedShare: number;
    /** Seconds, for the idle and nervous jiggles. */
    readonly time: number;
    /** Whether the countdown is low: he jiggles nervously. */
    readonly nervous: boolean;
    /** What is left of the eat stretch, 1 just after a bite down to 0. */
    readonly eatPulse: number;
}

export interface SquashPose {
    /** Height scale (stretch above 1, squash below). */
    readonly sy: number;
    /** Width and depth scale: the inverse square root of `sy`, so the plush keeps its volume. */
    readonly sxz: number;
    /** How far he is off the ground in a hop, in metres. */
    readonly lift: number;
    /** Side-to-side waddle, in degrees. */
    readonly rollDegrees: number;
}

/** How much the footstep phase advances when Benny covers `metres` at `weight`: π per footstep. */
export function stridePhaseDelta(metres: number, weight: number): number {
    const { slim, heavy } = EFFECTS.squash.stepMetres;
    const step = slim + (heavy - slim) * clampWeight(weight);
    return (Math.PI * Math.max(0, metres)) / step;
}

/** The share of the eat stretch left after `dt` more seconds. */
export function decayEatPulse(pulse: number, dt: number): number {
    return Math.max(0, pulse - Math.max(0, dt) / EFFECTS.squash.eat.seconds);
}

/** Benny's pose: hops, stretch and squash while running, a breathing jiggle standing still, a stretch on each bite. */
export function squashPose(input: SquashInput): SquashPose {
    const s = EFFECTS.squash;
    const speed = Math.min(1, Math.max(0, input.speedShare));
    const hop = Math.abs(Math.sin(input.stridePhase));
    // Stretched at the top of the hop, squashed as the foot lands
    let sy = 1 + s.runAmplitude * speed * (2 * hop - 1);
    sy += s.idle.amplitude * (1 - speed) * Math.sin(2 * Math.PI * s.idle.frequencyHz * input.time);
    if (input.nervous) {
        sy += s.nervous.amplitude * Math.sin(2 * Math.PI * s.nervous.frequencyHz * input.time);
    }
    const pulse = Math.min(1, Math.max(0, input.eatPulse));
    sy += s.eat.stretch * Math.sin(Math.PI * (1 - pulse)) * (pulse > 0 ? 1 : 0);
    sy = Math.min(s.limits.max, Math.max(s.limits.min, sy));
    return {
        sy,
        sxz: 1 / Math.sqrt(sy),
        lift: s.hopMetres * speed * hop,
        rollDegrees: s.waddleDegrees * speed * Math.sin(input.stridePhase)
    };
}
