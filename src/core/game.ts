import { KIOSKS, SIMULATION } from '../config/tuning';

import type { City } from './city/types';
import type { CollisionWorld } from './player/collision';
import { buildCollisionWorld } from './player/collision';
import type { MoveInput, PlayerState } from './player/movement';
import { stepPlayer } from './player/movement';
import { clampWeight, diameterAt } from './player/weight';
import { Rng } from './rng';
import type { KioskState } from './toilets/kiosks';
import { circleNearRect, initialKiosks, occupyAfterUse, tickKiosks } from './toilets/kiosks';
import type { UrgencyState } from './urgency/urgency';
import { initialUrgency, isOut, relieve, tickUrgency } from './urgency/urgency';

/** Extra clearance around Benny where he is placed, so he starts clear of every wall, in metres. */
const PLACEMENT_MARGIN = 0.25;
/** Mixed into the seed for the run's own random stream, so it never mirrors the city generator's. */
const RUN_SALT = 0x5bd1e995;

export interface GameOptions {
    /** Starting weight, 0 to 1 (`?weight=` for testing the girth tiers). */
    readonly weight?: number;
    /** Countdown length in seconds (`?countdown=` for testing; the design value otherwise). */
    readonly countdownSeconds?: number;
}

/** What the run is doing: Benny playing, relieved in a toilet, frozen in an accident, or out of underpants. */
export type GamePhase = 'playing' | 'relief' | 'accident' | 'over';

/** Things that happened during a step, for the views (sounds, effects, HUD) to react to. */
export type GameEvent = 'accident' | 'accidentOver' | 'gameOver' | 'reliefStart' | 'reliefEnd';

/** A toilet Benny can use: one of the city's kiosks (by index). */
export interface ToiletRef {
    readonly kind: 'kiosk';
    readonly index: number;
}

/**
 * The simulation (AGENTS.md, Architecture): it owns the state of a run and advances it in fixed steps. It never reads
 * the clock; time arrives through `step`, one fixed step at a time, and randomness comes from the seed.
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
    kiosks: KioskState[];
    /** Relief in progress: the toilet Benny is in and the seconds it still lasts. */
    relief: { toilet: ToiletRef; secondsLeft: number } | null = null;
    /** How long Benny has stood at the door of a free toilet, counting towards using it. */
    dwell: { toilet: ToiletRef; seconds: number } | null = null;
    /** The occupied kiosk Benny is waiting at, if any (the HUD shows how long until it frees up). */
    waitingAt: number | null = null;
    private readonly kioskRng: Rng;
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
        const runRng = new Rng((city.seed ^ RUN_SALT) >>> 0);
        this.kioskRng = runRng.fork();
        this.kiosks = initialKiosks(city.kioskSpots.length, this.kioskRng);
    }

    get phase(): GamePhase {
        if (isOut(this.urgency)) {
            return 'over';
        }
        if (this.urgency.accidentSecondsLeft > 0) {
            return 'accident';
        }
        return this.relief ? 'relief' : 'playing';
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
        const dt = this.stepSeconds;
        const phase = this.phase;

        // Benny runs while playing; he stands still inside a toilet and while frozen in an accident
        this.player =
            phase === 'playing' ? stepPlayer(this.player, input, this.world, dt) : { ...this.player, vx: 0, vz: 0 };

        this.kiosks = tickKiosks(this.kiosks, dt, this.kioskRng, this.time).kiosks;

        if (this.relief) {
            this.relief = { ...this.relief, secondsLeft: this.relief.secondsLeft - dt };
            if (this.relief.secondsLeft <= 0) {
                this.relief = null;
                this.urgency = relieve(this.urgency);
                this.events.push('reliefEnd');
            }
        }

        const urgency = tickUrgency(this.urgency, dt, phase === 'relief');
        this.urgency = urgency.state;
        for (const event of urgency.events) {
            this.events.push(event === 'outOfUnderpants' ? 'gameOver' : event);
        }

        if (this.phase === 'playing') {
            this.useToilets(dt);
        } else {
            this.dwell = null;
            this.waitingAt = null;
        }
        this.time += dt;
    }

    /** Standing at the door of a free kiosk for a moment starts the relief; at an occupied one Benny waits. */
    private useToilets(dt: number): void {
        const radius = diameterAt(this.player.weight) / 2;
        const at = this.city.kioskSpots.findIndex((spot) =>
            circleNearRect(this.player.x, this.player.z, radius, spot.doorZone, KIOSKS.doorReachMetres)
        );
        if (at < 0) {
            this.dwell = null;
            this.waitingAt = null;
            return;
        }
        if (this.kiosks[at].status === 'occupied') {
            this.dwell = null;
            this.waitingAt = at;
            return;
        }
        this.waitingAt = null;
        const seconds = (this.dwell?.toilet.index === at ? this.dwell.seconds : 0) + dt;
        if (seconds < KIOSKS.useDwellSeconds) {
            this.dwell = { toilet: { kind: 'kiosk', index: at }, seconds };
            return;
        }
        this.dwell = null;
        this.relief = { toilet: { kind: 'kiosk', index: at }, secondsLeft: KIOSKS.reliefSeconds };
        this.kiosks[at] = occupyAfterUse(this.kioskRng, this.time);
        this.events.push('reliefStart');
    }
}
