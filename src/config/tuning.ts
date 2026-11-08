/**
 * Every gameplay number in the game, with its unit. The values are the *initial* ones from `docs/GAME_DESIGN.md`;
 * when playtesting changes one, change it here and in the design document together. No other file may hold a
 * gameplay number.
 */

/** A closed interval `[min, max]`, sampled uniformly unless a comment says otherwise. */
export interface Range {
    readonly min: number;
    readonly max: number;
}

/** Fixed-step simulation (AGENTS.md, Architecture). */
export const SIMULATION = {
    /** Simulation steps per second; rendering interpolates between steps. */
    stepsPerSecond: 60,
    /** At most this many steps per rendered frame: very slow frames slow the game down instead of piling up steps. */
    maxStepsPerFrame: 5
} as const;

/** Street classes, from narrowest to widest. */
export type StreetClass = 'alley' | 'street' | 'avenue' | 'boulevard';

export interface StreetClassTuning {
    /** Walkable width between building fronts, sidewalks included, in metres. */
    readonly widthMetres: number;
    /** Whether cars drive on it. */
    readonly cars: boolean;
    /** Whether buses drive on it. */
    readonly buses: boolean;
}

/** The procedurally generated city (design: *The city*). */
export const CITY = {
    /** Side of the square city, in metres, inside the park and river edge. */
    sizeMetres: 320,
    streetClasses: {
        alley: { widthMetres: 2, cars: false, buses: false },
        street: { widthMetres: 6, cars: true, buses: false },
        avenue: { widthMetres: 12, cars: true, buses: true },
        boulevard: { widthMetres: 20, cars: true, buses: true }
    } satisfies Record<StreetClass, StreetClassTuning>,
    /** Approximate distance between neighbouring streets of the grid, in metres. */
    streetSpacingMetres: 40,
    /** Approximate distance between neighbouring avenues, in metres. */
    avenueSpacingMetres: 80,
    /** Boulevards crossing the city in each direction (one or two). */
    boulevardsPerAxis: { min: 1, max: 2 } satisfies Range,
    /** Share of blocks an alley cuts through (about half). */
    alleyBlockShare: 0.5,
    /**
     * Side of a navigation grid cell, in metres. The generator puts every road edge and building edge on whole
     * metres, so with 1 m cells the clearance field is exact. Keep it at 1.
     */
    navCellMetres: 1,
    /** Avenues and boulevards move up to this far from their even spacing, in metres. */
    majorJitterMetres: 8,
    /** Streets move up to this far from their even spacing, in metres. */
    streetJitterMetres: 4,
    /** Share of street spans (from one major road to the next) that exist; the others merge two blocks into one. */
    streetSpanKeepShare: 0.85,
    /** Narrowest block side, in metres; streets that would make a block narrower are left out. */
    minBlockMetres: 16,
    /** An alley stays at least this far from the corners of its block, in metres. */
    alleyMinOffsetMetres: 6,
    /** Width of a building lot along its street, in metres (whole metres). */
    lotWidthMetres: { min: 8, max: 16 } satisfies Range,
    /** Blocks at least this deep get two rows of buildings back to back instead of one, in metres. */
    twoRowMinDepthMetres: 24,
    /**
     * Building heights, in metres (whole metres). Kept below the camera height for a slim Benny (about 14.7 m), so roofs
     * never fill the screen.
     */
    buildingHeightMetres: { min: 4, max: 12 } satisfies Range,
    /** The clock tower landmark, next to the central plaza, in metres. */
    clockTowerHeightMetres: 24,
    /** Radius of the fountain in the middle of the central plaza, in metres. */
    fountainRadiusMetres: 3,
    /** Trees in the park: spacing of their jittered grid, trunk radius and margin from the park edge, in metres. */
    parkTrees: { spacingMetres: 9, radiusMetres: 0.8, marginMetres: 3 },
    /** Sides of the city bordered by the river; the other sides are parkland. Either way, the edge blocks the way. */
    riverSides: { min: 1, max: 2 } satisfies Range
} as const;

/** Benny's body (design: *The protagonist* and *Weight, girth and speed*). */
export const BENNY = {
    /** Height of the slim plush body, in metres. */
    heightMetres: 1.6,
    /** At maximum weight the model grows in height up to this factor (it also widens with the diameter). */
    maxHeightScale: 2
} as const;

/**
 * Weight `w` goes from 0 (slim) to 1 (maximum). Junk food adds it; nothing removes it during a run.
 * The formulas below are evaluated in `src/core/player/`.
 */
export const WEIGHT = {
    /** Diameter of the collision circle: `d(w) = baseMetres + gainMetres * w^exponent` (0.9 m to 7.5 m). */
    diameter: { baseMetres: 0.9, gainMetres: 6.6, exponent: 1.3 },
    /** Top speed: `v(w) = baseMetresPerSecond * (1 - slowdown * w^exponent)` (7 m/s to 2.1 m/s). */
    topSpeed: { baseMetresPerSecond: 7.0, slowdown: 0.7, exponent: 0.8 },
    /** Acceleration and deceleration scale with `1 - weightPenalty * w`. */
    acceleration: { weightPenalty: 0.6 },
    /**
     * Girth tiers shown in the HUD, in order; each covers the weights above the previous tier's `maxWeight` up to its
     * own. The boundaries follow from the diameter formula and the street widths (alleys stop fitting near 0.25,
     * streets near 0.82); 0.5 is the car crumple threshold.
     */
    tiers: [
        { name: 'slim', maxWeight: 0.25 },
        { name: 'chubby', maxWeight: 0.5 },
        { name: 'round', maxWeight: 0.82 },
        { name: 'massive', maxWeight: 1 }
    ]
} as const;

/** How Benny runs (design: *Controls*). Acceleration and braking scale with `WEIGHT.acceleration`. */
export const MOVEMENT = {
    /** Acceleration towards the arrow-key direction for a slim Benny, in m/s². */
    accelerationMetresPerSecond2: 30,
    /** Braking when no arrow key is held, for a slim Benny, in m/s². */
    brakingMetresPerSecond2: 40,
    /** How fast Benny turns to face his direction of travel, in degrees per second. */
    turnDegreesPerSecond: 720
} as const;

/** Perspective camera above and behind Benny (design: *Camera*). It never rotates. */
export const CAMERA = {
    /** Angle below the horizon the camera looks down at, in degrees. */
    pitchDegrees: 55,
    /** Vertical field of view, in degrees. */
    fovDegrees: 45,
    /** Distance from Benny, in metres: `slimMetres` at `w = 0`, `maxWeightMetres` at `w = 1`. */
    distance: { slimMetres: 18, maxWeightMetres: 40 },
    /** Opacity of buildings between the camera and Benny. */
    buildingFadeOpacity: 0.25,
    /** How fast the camera catches up with Benny: the gap shrinks by `1 - e^(-rate * t)`. */
    followRatePerSecond: 5,
    /** How fast it pulls back or closes in when Benny's weight changes, same form. */
    distanceRatePerSecond: 1.5,
    /** The camera aims ahead of Benny by his velocity times this, in seconds... */
    lookAheadSeconds: 0.4,
    /** ...but never more than this far ahead, in metres. */
    maxLookAheadMetres: 3,
    /** A building fades when the line from the camera to Benny passes this close to it, in metres. */
    fadeMarginMetres: 0.5
} as const;

/** Urgency countdown, accidents and lives (design: *Urgency countdown and underpants*). */
export const URGENCY = {
    /** Countdown length, in seconds; it resets to this after every relief and every accident. */
    countdownSeconds: 40,
    /** Below this many seconds the gauge turns red and shakes and Benny waddles clenched. */
    lowWarningSeconds: 10,
    /** How long Benny freezes and shivers during an accident, in seconds. */
    accidentFreezeSeconds: 1.5,
    /** Pairs of underpants (lives) at the start of a run. */
    underpants: 5
} as const;

/** Public toilet kiosks (design: *Toilets*). */
export const KIOSKS = {
    /** Kiosks placed on the sidewalks of streets and avenues. */
    count: 8,
    /**
     * Side of the square kiosk footprint, in metres. The kiosk stands in a notch of its building, flush with the
     * facades, so it never narrows the street.
     */
    footprintMetres: 2,
    /** Depth of the door zone on the sidewalk in front of the kiosk, in metres. */
    doorZoneDepthMetres: 1.5,
    /** How long a kiosk stays free per cycle, in seconds. */
    freeSeconds: { min: 6, max: 14 } satisfies Range,
    /** How long a kiosk stays occupied per cycle, in seconds. */
    occupiedSeconds: { min: 5, max: 15 } satisfies Range,
    /** How long Benny must stand in the door zone of a free kiosk to use it, in seconds. */
    useDwellSeconds: 0.5,
    /** Relief animation length, in seconds; Benny cannot be hurt meanwhile. */
    reliefSeconds: 1.5,
    /** How long a kiosk stays occupied after Benny used it, in seconds. */
    occupiedAfterUseSeconds: { min: 5, max: 10 } satisfies Range,
    /** Benny counts as standing in a door zone when his circle comes this close to it, in metres. */
    doorReachMetres: 0.3
} as const;

/** Pop-up toilets that keep a heavy Benny in the game (design: *Pop-up toilets*). */
export const POPUP_TOILETS = {
    /** Spawn interval, in seconds, interpolated from `atZeroWeight` (w = 0) to `atMaxWeight` (w = 1). */
    spawnIntervalSeconds: { atZeroWeight: 25, atMaxWeight: 6 },
    /** How long a pop-up toilet stays, in seconds. */
    lifetimeSeconds: 20,
    /** Most pop-up toilets in the city at once. */
    maxActive: 4,
    /** Path distance from Benny, at his current girth, where one may spawn, in metres. */
    spawnPathDistanceMetres: { min: 25, max: 80 } satisfies Range,
    /**
     * Mercy rule: when no free toilet is reachable within this share of the remaining countdown at Benny's current
     * speed, one pop-up toilet spawns within reach at once, at most once per countdown cycle.
     */
    mercyTimeShare: 0.8,
    /** Mercy spawns allowed per countdown cycle. */
    mercyPerCycle: 1
} as const;

/** Off-screen toilet indicators (design: *Finding them*). */
export const TOILET_INDICATORS = {
    /** Free toilets indicated, nearest first by path distance at Benny's current girth. */
    count: 3
} as const;

export type JunkFoodId = 'burger' | 'chickenLeg' | 'pizzaSlice' | 'hotDog' | 'donut' | 'fries' | 'iceCreamCone';
export type VegetableId = 'beans' | 'cabbage' | 'brusselsSprouts' | 'broccoli' | 'cauliflower' | 'carrot';

export interface JunkFoodTuning {
    /** Points before the combo multiplier. */
    readonly points: number;
    /** Weight added when eaten (weight is 0 to 1). */
    readonly weight: number;
}

export interface VegetableTuning {
    /** Seconds removed from the urgency countdown when eaten. */
    readonly countdownPenaltySeconds: number;
}

/** Food items, spawning and effects (design: *Food*). */
export const FOOD = {
    /** Approximate size of an item, in metres, so it reads clearly from above. */
    itemSizeMetres: 1,
    junk: {
        burger: { points: 100, weight: 0.035 },
        chickenLeg: { points: 90, weight: 0.035 },
        pizzaSlice: { points: 80, weight: 0.03 },
        hotDog: { points: 70, weight: 0.03 },
        donut: { points: 60, weight: 0.025 },
        fries: { points: 50, weight: 0.02 },
        iceCreamCone: { points: 40, weight: 0.015 }
    } satisfies Record<JunkFoodId, JunkFoodTuning>,
    vegetables: {
        beans: { countdownPenaltySeconds: 10 },
        cabbage: { countdownPenaltySeconds: 8 },
        brusselsSprouts: { countdownPenaltySeconds: 7 },
        broccoli: { countdownPenaltySeconds: 6 },
        cauliflower: { countdownPenaltySeconds: 5 },
        carrot: { countdownPenaltySeconds: 4 }
    } satisfies Record<VegetableId, VegetableTuning>,
    /** Seconds between two spawns. */
    spawnIntervalSeconds: 1.2,
    /** Most food items in the city at once. */
    maxActive: 25,
    /** How long an item stays before fading out, in seconds. */
    lifetimeSeconds: 30,
    /** Share of spawns that are vegetables: `start` at the beginning of a run, rising linearly to `end`. */
    vegetableShare: { start: 0.2, end: 0.4, rampSeconds: 8 * 60 }
} as const;

/** Vehicles (design: *Traffic*). Cars use streets, avenues and boulevards; buses only avenues and boulevards. */
export const TRAFFIC = {
    /** Cruising speeds, in metres per second, picked per vehicle. */
    speedMetresPerSecond: {
        car: { min: 9, max: 14 } satisfies Range,
        bus: { min: 7, max: 9 } satisfies Range
    },
    /** Vehicles at the start of a run. */
    initialCount: { cars: 12, buses: 3 },
    /** Density growth per minute (0.15 = 15% more vehicles each minute). */
    densityGrowthPerMinute: 0.15,
    /** Density stops growing at this multiple of the initial count. */
    maxDensityFactor: 3
} as const;

/** Benny against vehicles (design: *Collisions*). */
export const COLLISIONS = {
    /** At or above this weight the vehicle crumples instead of knocking Benny over. */
    crumpleWeightThreshold: { car: 0.5, bus: 0.85 },
    /**
     * Knock-back distance, in metres, scaled by `1 - w / threshold` (a fatter Benny is pushed less).
     */
    knockBackMaxMetres: 8,
    /** Stun time, in seconds, scaled by `1 - w / threshold`, but never below `min`. */
    stunSeconds: { min: 0.3, max: 1.2 } satisfies Range,
    /** Seconds removed from the urgency countdown when a vehicle knocks Benny over (the shock). */
    shockCountdownPenaltySeconds: 3,
    /** A crumpled vehicle squashes to this share of its length. */
    crumpledLengthShare: 0.4,
    /** Benny is slowed for this long after a belly bounce, in seconds. */
    bellyBounceSlowSeconds: 0.3,
    /** A crumpled vehicle disappears after this long, in seconds. */
    crumpledLifetimeSeconds: 3
} as const;

/** Points (design: *Scoring*). */
export const SCORING = {
    combo: {
        /** Eating again within this many seconds of the previous item raises the multiplier. */
        windowSeconds: 3,
        /** Multiplier increase per chained item. */
        step: 0.5,
        /** Highest multiplier. */
        max: 3
    },
    relief: {
        /** Points for reaching a free toilet. */
        basePoints: 250,
        /** Clutch bonus per second left on the countdown. */
        pointsPerSecondLeft: 20
    },
    /** Points for crumpling a vehicle. */
    crumplePoints: { car: 300, bus: 800 },
    /** Best scores kept in `localStorage`. */
    highScoresKept: 5
} as const;

/** Difficulty over time (design: *Difficulty over time*). Traffic and vegetables ramp in their own sections. */
export const DIFFICULTY = {
    /** Kiosk occupied times grow by this share per minute (0.1 = 10%). */
    kioskOccupiedGrowthPerMinute: 0.1,
    /** Kiosk occupied times stop growing at this multiple of their initial range. */
    kioskOccupiedMaxFactor: 2
} as const;
