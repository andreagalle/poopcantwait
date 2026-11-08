import { SIMULATION } from '../config/tuning';

import type { City } from './city/types';
import type { CollisionWorld } from './player/collision';
import { buildCollisionWorld } from './player/collision';
import type { MoveInput, PlayerState } from './player/movement';
import { stepPlayer } from './player/movement';
import { clampWeight, diameterAt } from './player/weight';

/** Extra clearance around Benny where he is placed, so he starts clear of every wall, in metres. */
const PLACEMENT_MARGIN = 0.25;

export interface GameOptions {
    /** Starting weight, 0 to 1 (`?weight=` for testing the girth tiers). */
    readonly weight?: number;
}

/**
 * The simulation (AGENTS.md, Architecture): it owns the state of a run and advances it in fixed steps. It never reads
 * the clock; time arrives through `step`, one fixed step at a time.
 */
export class Game {
    readonly city: City;
    readonly world: CollisionWorld;
    readonly stepSeconds = 1 / SIMULATION.stepsPerSecond;
    /** Simulated seconds since the start. */
    time = 0;
    player: PlayerState;
    /** The player one step ago, for interpolated rendering. */
    previousPlayer: PlayerState;

    constructor(city: City, options: GameOptions = {}) {
        this.city = city;
        this.world = buildCollisionWorld(city);
        const weight = clampWeight(options.weight ?? 0);
        const start =
            city.nav.nearestStandable(city.spawn, diameterAt(weight) + 2 * PLACEMENT_MARGIN) ??
            city.nav.nearestStandable(city.spawn, diameterAt(weight)) ??
            city.spawn;
        this.player = { x: start.x, z: start.z, vx: 0, vz: 0, heading: 0, weight };
        this.previousPlayer = this.player;
    }

    /** Advances the run by one fixed step with the current arrow-key direction. */
    step(input: MoveInput): void {
        this.previousPlayer = this.player;
        this.player = stepPlayer(this.player, input, this.world, this.stepSeconds);
        this.time += this.stepSeconds;
    }
}
