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
    mercyPerCycle: 1,
    /**
     * Where a mercy pop-up appears: between these shares of the distance Benny can still cover, so he makes it in time,
     * and never closer than `mercyMinMetres`.
     */
    mercyDistanceShare: { min: 0.3, max: 0.6 } satisfies Range,
    mercyMinMetres: 5,
    /** Side of the square cabin, in metres. Pop-ups are not solid: Benny steps into one to use it. */
    footprintMetres: 1.4
} as const;

/** Path distances from Benny at his current girth, shared by pop-ups, the mercy rule and the toilet indicators. */
export const NAVIGATION = {
    /** How often the distances are recomputed, in seconds of game time. */
    refreshSeconds: 0.5,
    /**
     * Cells the search settles per simulation step: one search is spread over several steps, so no frame pays for all
     * of it. A slim Benny reaches about 37,000 cells: 10 steps (0.17 s) at about half a millisecond each on a laptop,
     * instead of one 4 ms hitch twice a second, which a phone two to four times slower would feel. The new distances
     * replace the old ones when the search is complete. A count of cells, not of milliseconds, so that a seeded run
     * plays the same on every machine.
     */
    searchCellsPerStep: 4000,
    /** How far they reach along the paths, in metres; anything farther counts as out of reach. */
    maxPathMetres: 200
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
    vegetableShare: { start: 0.2, end: 0.4, rampSeconds: 8 * 60 },
    /**
     * Items appear on walkable ground this far from Benny, in a straight line, in metres. Spread over the whole city,
     * 25 items would hardly ever be on screen.
     */
    spawnDistanceMetres: { min: 6, max: 40 } satisfies Range
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
    maxDensityFactor: 3,
    /** Vehicle footprints and heights, in metres. */
    size: {
        car: { length: 4.2, width: 1.9, height: 1.5 },
        bus: { length: 11, width: 2.6, height: 3.2 }
    },
    /** Each direction drives in one lane, centred this share of the road width from its centre line (right-hand traffic). */
    laneOffsetShare: 0.25,
    /** New vehicles appear at least this far from Benny, in metres, so they never pop in on screen. */
    spawnMinDistanceMetres: 45,
    /** Vehicles honk when Benny is this close ahead of them in their lane, in metres... */
    honkDistanceMetres: 12,
    /** ...at most once in this many seconds each. */
    honkCooldownSeconds: 2.5
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
    crumpledLifetimeSeconds: 3,
    /** While slowed after a belly bounce, Benny's top speed is cut to this share. */
    bellyBounceSpeedShare: 0.5,
    /** After being knocked over, vehicles cannot hit Benny again for the stun plus this long, in seconds. */
    invulnerableAfterHitSeconds: 0.5
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

/** Sound (design: *Audio*). Every sound is synthesized in code with the Web Audio API; none plays before a key press. */
export const AUDIO = {
    /** Overall volume, 0 to 1. */
    masterVolume: 0.8,
    /** Sound effects volume, 0 to 1, under the master volume. */
    effectsVolume: 0.9,
    /** Music loop volume, 0 to 1, under the master volume. */
    musicVolume: 0.4,
    /**
     * While the countdown is low (`URGENCY.lowWarningSeconds`), the tummy rumbles at once and then every `max` seconds,
     * the interval shrinking linearly to `min` as the countdown reaches 0.
     */
    rumbleIntervalSeconds: { min: 1.1, max: 2.6 },
    /** Music tempo, in beats per minute. */
    musicBeatsPerMinute: 128,
    /** The music plays this many times faster while the countdown is low. */
    urgentTempoFactor: 1.25,
    /** The same sound effect does not start again within this many seconds (a burst of honks plays once). */
    repeatGuardSeconds: 0.08
} as const;

/**
 * Game feel (design: *Game feel*): camera shake, Benny's squash and stretch, and puffs of smoke and crumbs. None of it
 * changes the simulation; it only shows what happened.
 */
export const EFFECTS = {
    shake: {
        /** Largest camera offset at full trauma, in metres; the offset grows with trauma squared. */
        maxOffsetMetres: 0.7,
        /** Trauma lost per second. */
        decayPerSecond: 1.8,
        /** How fast the camera shakes, in cycles per second. */
        frequencyHz: 17,
        /** Trauma (0 to 1) each event adds. */
        trauma: { knocked: 0.75, crumple: 0.6, accident: 0.4 }
    },
    squash: {
        /** One hop per footstep: Benny takes a step every this many metres, a little longer when heavy. */
        stepMetres: { slim: 0.75, heavy: 1.1 },
        /** Stretch at the top of a hop and squash at the landing, at full speed (share of his height). */
        runAmplitude: 0.09,
        /** Hop height at full speed, in metres. */
        hopMetres: 0.12,
        /** Side-to-side waddle at full speed, in degrees. */
        waddleDegrees: 7,
        /** Breathing jiggle when standing still: share of his height and cycles per second. */
        idle: { amplitude: 0.025, frequencyHz: 1.6 },
        /** The nervous jiggle while the countdown is low, standing or running. */
        nervous: { amplitude: 0.035, frequencyHz: 9 },
        /** A quick stretch when he eats: how long, in seconds, and how much (share of his height). */
        eat: { seconds: 0.25, stretch: 0.16 },
        /** Squash and stretch never go beyond these height shares. */
        limits: { min: 0.7, max: 1.35 }
    },
    puffs: {
        /** Most puffs on screen at once. */
        pool: 40,
        /** Crumbs and leaves fall with this pull, in m/s²; smoke, dust and stink float. */
        gravity: 12,
        /** Floating puffs slow down by `e^(-drag * t)` (air drag), per second. */
        dragPerSecond: 2.5,
        /** Crumbs bursting out of a bite: count, speed in m/s, size in metres, life in seconds. */
        bite: { count: 8, speed: 3.5, size: 0.4, lifeSeconds: 0.5 },
        /** Smoke from a crumpled vehicle. */
        crumple: { count: 10, speed: 3, size: 1.8, lifeSeconds: 1.2 },
        /** Dust where a vehicle knocks Benny over. */
        knocked: { count: 6, speed: 2, size: 0.6, lifeSeconds: 0.6 },
        /** The stink cloud around Benny during an accident: one puff every this many seconds, rising slowly. */
        stink: { everySeconds: 0.07, speed: 0.9, size: 0.9, lifeSeconds: 1.3 },
        /** After an accident a thinner stink trails behind him for this long, one puff every `everySeconds`. */
        stinkTrail: { seconds: 4, everySeconds: 0.3 }
    }
} as const;
