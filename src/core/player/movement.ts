import { MOVEMENT } from '../../config/tuning';

import type { CollisionWorld } from './collision';
import { overlapDepth, pushOut } from './collision';
import { accelerationScaleAt, diameterAt, topSpeedAt } from './weight';

/** Benny's body in the simulation. Positions are on the ground plane, in metres; velocities in m/s. */
export interface PlayerState {
    readonly x: number;
    readonly z: number;
    readonly vx: number;
    readonly vz: number;
    /** Facing, in radians around the vertical axis: 0 faces +z (down the screen), π/2 faces +x. */
    readonly heading: number;
    /** Weight, 0 (slim) to 1 (maximum). */
    readonly weight: number;
}

/** Where the arrow keys point, screen-relative: x to the right, z down the screen. Length 0 to 1. */
export interface MoveInput {
    readonly x: number;
    readonly z: number;
}

/** Allowed leftover overlap after a step, in metres. */
const TOLERANCE = 1e-3;
/** Below this speed Benny keeps his facing, in m/s. */
const TURN_MIN_SPEED = 0.2;

/** Wraps an angle into `(-π, π]`. */
export function wrapAngle(a: number): number {
    const wrapped = a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
    return wrapped === -Math.PI ? Math.PI : wrapped;
}

/**
 * Advances Benny by one fixed step: steer the velocity towards the arrow-key direction at his top speed (accelerating
 * or braking at a rate that worsens with weight), move, then push him out of walls and drop the part of his velocity
 * that points into them, so he slides along facades. A move that would leave him stuck (a gap narrower than his
 * girth) is cancelled.
 */
export function stepPlayer(state: PlayerState, input: MoveInput, world: CollisionWorld, dt: number): PlayerState {
    const length = Math.hypot(input.x, input.z);
    const dirX = length > 1 ? input.x / length : input.x;
    const dirZ = length > 1 ? input.z / length : input.z;
    const top = topSpeedAt(state.weight);
    const scale = accelerationScaleAt(state.weight);
    const steering = length > 0;
    const rate = (steering ? MOVEMENT.accelerationMetresPerSecond2 : MOVEMENT.brakingMetresPerSecond2) * scale;

    // Velocity towards the target, limited by the acceleration
    let dvx = dirX * top - state.vx;
    let dvz = dirZ * top - state.vz;
    const change = Math.hypot(dvx, dvz);
    const maxChange = rate * dt;
    if (change > maxChange) {
        dvx *= maxChange / change;
        dvz *= maxChange / change;
    }
    let vx = state.vx + dvx;
    let vz = state.vz + dvz;

    // Move, then resolve collisions
    const radius = diameterAt(state.weight) / 2;
    const moved = pushOut(world, state.x + vx * dt, state.z + vz * dt, radius);
    let x = moved.x;
    let z = moved.z;
    if (overlapDepth(world, x, z, radius) > TOLERANCE) {
        x = state.x;
        z = state.z;
        vx = 0;
        vz = 0;
    } else {
        for (const { nx, nz } of moved.contacts) {
            const into = vx * nx + vz * nz;
            if (into < 0) {
                vx -= into * nx;
                vz -= into * nz;
            }
        }
    }

    // Turn to face the direction of travel
    let heading = state.heading;
    if (Math.hypot(vx, vz) > TURN_MIN_SPEED) {
        const target = Math.atan2(vx, vz);
        const delta = wrapAngle(target - heading);
        const maxTurn = ((MOVEMENT.turnDegreesPerSecond * Math.PI) / 180) * dt;
        heading = wrapAngle(heading + Math.max(-maxTurn, Math.min(maxTurn, delta)));
    }

    return { x, z, vx, vz, heading, weight: state.weight };
}
