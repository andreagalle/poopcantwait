import { FOOD, KIOSKS, NAVIGATION, POPUP_TOILETS, SIMULATION } from '../config/tuning';

import type { City, Point } from './city/types';
import type { FoodItem, FoodKind } from './food/food';
import { chooseFoodSpot, chooseKind, touchesFood } from './food/food';
import type { CollisionWorld } from './player/collision';
import { buildCollisionWorld, overlapDepth } from './player/collision';
import type { MoveInput, PlayerState } from './player/movement';
import { stepPlayer } from './player/movement';
import { clampWeight, diameterAt, girthTierAt, topSpeedAt } from './player/weight';
import { Rng } from './rng';
import type { ScoreState } from './score/score';
import { initialScore, scoreJunk, scoreRelief, tickScore } from './score/score';
import type { KioskState } from './toilets/kiosks';
import { circleNearRect, initialKiosks, occupyAfterUse, tickKiosks } from './toilets/kiosks';
import type { PopupToilet } from './toilets/popups';
import { choosePopupSpot, popupIntervalAt, touchesPopup } from './toilets/popups';
import type { UrgencyState } from './urgency/urgency';
import { initialUrgency, isOut, penalize, relieve, tickUrgency } from './urgency/urgency';

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
export type GameEvent =
    | 'accident'
    | 'accidentOver'
    | 'gameOver'
    | 'reliefStart'
    | 'reliefEnd'
    | 'popupSpawned'
    | 'popupGone'
    | 'mercy'
    | 'tierChanged'
    | 'squeezed'
    | 'ateJunk'
    | 'ateVegetable';

/** Something Benny ate, for the views to show where and what. */
export interface Eaten {
    readonly kind: FoodKind;
    readonly x: number;
    readonly z: number;
}

/** Points scored, and where, for the views to show them. */
export interface Gain {
    readonly points: number;
    readonly x: number;
    readonly z: number;
}

/** A toilet Benny can use: one of the city's kiosks (by index) or a pop-up toilet (by id). */
export type ToiletRef =
    { readonly kind: 'kiosk'; readonly index: number } | { readonly kind: 'popup'; readonly id: number };

const sameToilet = (a: ToiletRef, b: ToiletRef): boolean =>
    a.kind === 'kiosk' ? b.kind === 'kiosk' && a.index === b.index : b.kind === 'popup' && a.id === b.id;

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
    /** Pop-up toilets in the city, oldest first. */
    popups: PopupToilet[] = [];
    /**
     * Path distances from Benny at his current girth (`NavGrid.pathDistances`), recomputed every
     * `NAVIGATION.refreshSeconds`: pop-up placement, the mercy rule and the toilet indicators read them.
     */
    field!: { readonly time: number; readonly diameter: number; readonly distances: Float64Array };
    private fieldAge = 0;
    /** Food on the streets. */
    food: FoodItem[] = [];
    private foodTimer: number = FOOD.spawnIntervalSeconds;
    private nextFoodId = 1;
    private readonly eaten: Eaten[] = [];
    score: ScoreState = initialScore();
    private readonly gains: Gain[] = [];
    private popupTimer: number;
    private nextPopupId = 1;
    private mercyUsed = false;
    private readonly kioskRng: Rng;
    private readonly popupRng: Rng;
    private readonly foodRng: Rng;
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
        this.popupRng = runRng.fork();
        this.foodRng = runRng.fork();
        this.kiosks = initialKiosks(city.kioskSpots.length, this.kioskRng);
        this.popupTimer = popupIntervalAt(weight);
        this.refreshField();
    }

    /**
     * Benny gains weight (junk food). Weight only grows during a run and stops at 1. If he no longer fits where he
     * stands (a narrow street, an alley), he is squeezed out to the nearest spot along the passage where he does.
     */
    addWeight(amount: number): void {
        const before = this.player.weight;
        const weight = clampWeight(before + Math.max(0, amount));
        if (weight === before) {
            return;
        }
        this.player = { ...this.player, weight };
        if (girthTierAt(weight) !== girthTierAt(before)) {
            this.events.push('tierChanged');
        }
        const diameter = diameterAt(weight);
        if (overlapDepth(this.world, this.player.x, this.player.z, diameter / 2) > 0) {
            const spot =
                this.city.nav.nearestRoomy(this.player, diameter + 2 * PLACEMENT_MARGIN) ??
                this.city.nav.nearestRoomy(this.player, diameter);
            if (spot) {
                this.player = { ...this.player, x: spot.x, z: spot.z, vx: 0, vz: 0 };
                this.previousPlayer = { ...this.player };
                this.events.push('squeezed');
            }
        }
        // His girth changed what he can reach: refresh the distances at the next step
        this.fieldAge = NAVIGATION.refreshSeconds;
    }

    /** Recomputes the path distances from where Benny stands, at his current girth. */
    private refreshField(): void {
        const diameter = diameterAt(this.player.weight);
        const nav = this.city.nav;
        const here: Point = { x: this.player.x, z: this.player.z };
        const start = nav.canStand(here.x, here.z, diameter) ? here : (nav.nearestStandable(here, diameter) ?? here);
        this.field = {
            time: this.time,
            diameter,
            distances: nav.pathDistances(start, diameter, NAVIGATION.maxPathMetres)
        };
        this.fieldAge = 0;
    }

    /**
     * Walking distance from Benny to a toilet at his current girth, from the latest path distances; `Infinity` when he
     * cannot get there (too wide for the road in front of it) or it is beyond `NAVIGATION.maxPathMetres`.
     */
    toiletDistance(toilet: ToiletRef): number {
        const radius = this.field.diameter / 2;
        let target: Point;
        if (toilet.kind === 'kiosk') {
            // Where his centre stands when he touches the door: out from the kiosk front by his radius
            const spot = this.city.kioskSpots[toilet.index];
            const half = (spot.rect.x1 - spot.rect.x0) / 2;
            target = {
                x: (spot.rect.x0 + spot.rect.x1) / 2 + spot.facing.x * (half + radius + KIOSKS.doorReachMetres),
                z: (spot.rect.z0 + spot.rect.z1) / 2 + spot.facing.z * (half + radius + KIOSKS.doorReachMetres)
            };
        } else {
            const popup = this.popups.find((p) => p.id === toilet.id);
            if (!popup) {
                return Infinity;
            }
            target = popup;
        }
        // The nearest of the cells around the target, so rounding to the grid never hides a reachable door
        let best = Infinity;
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const cell = this.city.nav.cellAt(target.x + dx, target.z + dz);
                if (cell >= 0) {
                    best = Math.min(best, this.field.distances[cell]);
                }
            }
        }
        return best;
    }

    /** Every toilet Benny could use right now: the free kiosks and every pop-up. */
    freeToilets(): ToiletRef[] {
        const kiosks = this.kiosks.flatMap((k, index): ToiletRef[] =>
            k.status === 'free' ? [{ kind: 'kiosk', index }] : []
        );
        return [...kiosks, ...this.popups.map((p): ToiletRef => ({ kind: 'popup', id: p.id }))];
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

    /** Returns the points scored since the last call and forgets them. */
    drainGains(): Gain[] {
        return this.gains.splice(0);
    }

    /** Returns what Benny ate since the last call and forgets it. */
    drainEaten(): Eaten[] {
        return this.eaten.splice(0);
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
                this.mercyUsed = false;
                this.events.push('reliefEnd');
            }
        }

        this.score = tickScore(this.score, dt);
        const urgency = tickUrgency(this.urgency, dt, phase === 'relief');
        this.urgency = urgency.state;
        for (const event of urgency.events) {
            this.events.push(event === 'outOfUnderpants' ? 'gameOver' : event);
            if (event === 'accidentOver') {
                this.mercyUsed = false;
            }
        }

        this.fieldAge += dt;
        const refreshed = this.fieldAge >= NAVIGATION.refreshSeconds;
        if (refreshed) {
            this.refreshField();
        }
        this.updatePopups(dt, refreshed);
        this.updateFood(dt);

        if (this.phase === 'playing') {
            this.eat();
            this.useToilets(dt);
        } else {
            this.dwell = null;
            this.waitingAt = null;
        }
        this.time += dt;
    }

    /** Pop-ups sink back when their time is up, new ones appear on a timer, and the mercy rule can add one at once. */
    private updatePopups(dt: number, refreshed: boolean): void {
        const before = this.popups.length;
        this.popups = this.popups
            .map((p) => ({ ...p, secondsLeft: p.secondsLeft - dt }))
            .filter((p) => p.secondsLeft > 0);
        for (let i = this.popups.length; i < before; i++) {
            this.events.push('popupGone');
        }

        this.popupTimer -= dt;
        if (this.popupTimer <= 0) {
            this.popupTimer = popupIntervalAt(this.player.weight);
            if (this.popups.length < POPUP_TOILETS.maxActive) {
                const { min, max } = POPUP_TOILETS.spawnPathDistanceMetres;
                this.spawnPopup(min, max);
            }
        }

        // Mercy rule: checked whenever the distances are fresh, at most once per countdown cycle
        if (!refreshed || this.mercyUsed || this.phase !== 'playing') {
            return;
        }
        const speed = topSpeedAt(this.player.weight);
        const reach = POPUP_TOILETS.mercyTimeShare * this.urgency.secondsLeft * speed;
        const nearest = Math.min(Infinity, ...this.freeToilets().map((t) => this.toiletDistance(t)));
        if (nearest <= reach) {
            return;
        }
        const { min, max } = POPUP_TOILETS.mercyDistanceShare;
        const floor = POPUP_TOILETS.mercyMinMetres;
        if (this.popups.length >= POPUP_TOILETS.maxActive) {
            this.popups.shift();
            this.events.push('popupGone');
        }
        const spawned =
            this.spawnPopup(Math.max(floor, reach * min), Math.max(floor, reach * max)) || this.spawnPopup(0, reach);
        this.mercyUsed = true;
        if (spawned) {
            this.events.push('mercy');
        }
    }

    /** Items fade out when their time is up, and a new one appears on the spawn timer near Benny, up to the cap. */
    private updateFood(dt: number): void {
        this.food = this.food
            .map((item) => ({ ...item, secondsLeft: item.secondsLeft - dt }))
            .filter((item) => item.secondsLeft > 0);
        this.foodTimer -= dt;
        if (this.foodTimer > 0) {
            return;
        }
        this.foodTimer += FOOD.spawnIntervalSeconds;
        if (this.food.length >= FOOD.maxActive) {
            return;
        }
        const spot = chooseFoodSpot(this.city.nav, this.player, this.food, this.foodRng);
        if (spot) {
            const kind = chooseKind(this.foodRng, this.time);
            this.food.push({ id: this.nextFoodId++, kind, ...spot, secondsLeft: FOOD.lifetimeSeconds });
        }
    }

    /** Benny eats everything he touches: junk food fattens him, vegetables cost him seconds. */
    private eat(): void {
        const radius = diameterAt(this.player.weight) / 2;
        const touched = this.food.filter((item) => touchesFood(this.player.x, this.player.z, radius, item));
        if (touched.length === 0) {
            return;
        }
        this.food = this.food.filter((item) => !touched.includes(item));
        for (const item of touched) {
            this.eaten.push({ kind: item.kind, x: item.x, z: item.z });
            if (item.kind.category === 'junk') {
                this.events.push('ateJunk');
                const scored = scoreJunk(this.score, FOOD.junk[item.kind.id].points);
                this.score = scored.state;
                this.gains.push({ points: scored.gained, x: item.x, z: item.z });
                this.addWeight(FOOD.junk[item.kind.id].weight);
            } else {
                this.events.push('ateVegetable');
                this.urgency = penalize(this.urgency, FOOD.vegetables[item.kind.id].countdownPenaltySeconds);
            }
        }
    }

    /** Adds a pop-up at a path distance between `min` and `max` from Benny; false when no spot fits. */
    private spawnPopup(min: number, max: number): boolean {
        const spot = choosePopupSpot(this.city.nav, this.field.distances, this.field.diameter, min, max, this.popupRng);
        if (!spot) {
            return false;
        }
        this.popups.push({ id: this.nextPopupId++, x: spot.x, z: spot.z, secondsLeft: POPUP_TOILETS.lifetimeSeconds });
        this.events.push('popupSpawned');
        return true;
    }

    /**
     * Standing at the door of a free kiosk, or stepping into a pop-up, for a moment starts the relief; at an occupied
     * kiosk Benny waits.
     */
    private useToilets(dt: number): void {
        const { x, z } = this.player;
        const radius = diameterAt(this.player.weight) / 2;
        const reach = KIOSKS.doorReachMetres;
        let toilet: ToiletRef | null = null;
        const kiosk = this.city.kioskSpots.findIndex((spot) => circleNearRect(x, z, radius, spot.doorZone, reach));
        if (kiosk >= 0) {
            if (this.kiosks[kiosk].status === 'occupied') {
                this.dwell = null;
                this.waitingAt = kiosk;
                return;
            }
            toilet = { kind: 'kiosk', index: kiosk };
        } else {
            const popup = this.popups.find((p) => touchesPopup(x, z, radius, p, reach));
            toilet = popup ? { kind: 'popup', id: popup.id } : null;
        }
        this.waitingAt = null;
        if (!toilet) {
            this.dwell = null;
            return;
        }
        const seconds = (this.dwell && sameToilet(this.dwell.toilet, toilet) ? this.dwell.seconds : 0) + dt;
        if (seconds < KIOSKS.useDwellSeconds) {
            this.dwell = { toilet, seconds };
            return;
        }
        this.dwell = null;
        this.relief = { toilet, secondsLeft: KIOSKS.reliefSeconds };
        // The clutch bonus counts the seconds he had left when he made it
        const scored = scoreRelief(this.score, this.urgency.secondsLeft);
        this.score = scored.state;
        this.gains.push({ points: scored.gained, x: this.player.x, z: this.player.z });
        if (toilet.kind === 'kiosk') {
            this.kiosks[toilet.index] = occupyAfterUse(this.kioskRng, this.time);
        } else {
            const id = toilet.id;
            this.popups = this.popups.filter((p) => p.id !== id);
            this.events.push('popupGone');
        }
        this.events.push('reliefStart');
    }
}
