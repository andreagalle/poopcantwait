import { SIMULATION } from '../config/tuning';

import type { City } from './city/types';
import type { CollisionWorld } from './player/collision';
import { buildCollisionWorld } from './player/collision';
import type { MoveInput, PlayerState } from './player/movement';
import { stepPlayer } from './player/movement';
import { clampWeight, diameterAt } from './player/weight';
import type { UrgencyState } from './urgency/urgency';
import { initialUrgency, isOut, tickUrgency } from './urgency/urgency';

/** Extra clearance around Benny where he is placed, so he starts clear of every wall, in metres. */
const PLACEMENT_MARGIN = 0.25;

export interface GameOptions {
    /** Starting weight, 0 to 1 (`?weight=` for testing the girth tiers). */
    readonly weight?: number;
    /** Countdown length in seconds (`?countdown=` for testing; the design value otherwise). */
    readonly countdownSeconds?: number;
}

/** What the run is doing: Benny playing, frozen in an accident, or out of underpants. */
export type GamePhase = 'playing' | 'accident' | 'over';

/** Things that happened during a step, for the views (sounds, effects, HUD) to react to. */
export type GameEvent = 'accident' | 'accidentOver' | 'gameOver';

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
    urgency: UrgencyState;
    private readonly events: GameEvent[] = [];

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
        this.urgency = initialUrgency(options.countdownSeconds);
    }

    get phase(): GamePhase {
        if (isOut(this.urgency)) {
            return 'over';
        }
        return this.urgency.accidentSecondsLeft > 0 ? 'accident' : 'playing';
    }

    /** Returns the events since the last call and forgets them. */
    drainEvents(): GameEvent[] {
        return this.events.splice(0);
    }

    /** Advances the run by one fixed step with the current arrow-key direction. Nothing moves once the run is over. */
    step(input: MoveInput): void {
        this.previousPlayer = this.player;
        if (this.phase === 'over') {
            return;
        }
        // Frozen during an accident: he stops dead and shivers in place
        this.player =
            this.phase === 'accident'
                ? { ...this.player, vx: 0, vz: 0 }
                : stepPlayer(this.player, input, this.world, this.stepSeconds);
        const urgency = tickUrgency(this.urgency, this.stepSeconds);
        this.urgency = urgency.state;
        for (const event of urgency.events) {
            this.events.push(event === 'outOfUnderpants' ? 'gameOver' : event);
        }
        this.time += this.stepSeconds;
    }
}
