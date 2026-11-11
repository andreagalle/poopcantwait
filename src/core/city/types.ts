import type { StreetClass } from '../../config/tuning';

import type { NavGrid } from './navgrid';

/**
 * World coordinates are metres on the ground plane: x grows to the right of the screen, z towards the bottom of the
 * screen. The city is centred on the origin. North is -z (top of the screen), south +z, west -x, east +x.
 */
export interface Point {
    readonly x: number;
    readonly z: number;
}

/** Axis-aligned rectangle with `x0 < x1` and `z0 < z1`. City geometry always has whole-metre edges. */
export interface Rect {
    readonly x0: number;
    readonly z0: number;
    readonly x1: number;
    readonly z1: number;
}

export interface Circle extends Point {
    readonly radius: number;
}

/** The direction a road runs: `x` roads run left to right (constant z), `z` roads top to bottom (constant x). */
export type Axis = 'x' | 'z';

export type Side = 'north' | 'south' | 'west' | 'east';

export interface Road {
    readonly id: number;
    readonly streetClass: StreetClass;
    readonly axis: Axis;
    /** Coordinate of the centre line, across the road (z for `x` roads, x for `z` roads). */
    readonly centre: number;
    /** Extent along the road, `from < to`. */
    readonly from: number;
    readonly to: number;
    /** Walkable footprint, sidewalks included. */
    readonly rect: Rect;
}

export interface Building {
    /** Footprint. A building with a kiosk notch is made of several footprints sharing a height and colour. */
    readonly rect: Rect;
    readonly height: number;
    /** Index into the render palette (wrap it with the palette size). */
    readonly colorIndex: number;
    readonly landmark?: 'clockTower';
}

export interface KioskSpot {
    /** Footprint of the kiosk, flush with the facades of its building. */
    readonly rect: Rect;
    /** Unit vector from the kiosk towards the road its door faces. */
    readonly facing: Point;
    /** The sidewalk in front of the door, where Benny stands to use the kiosk. */
    readonly doorZone: Rect;
    /** Class of the road the door opens onto (a street or an avenue). */
    readonly roadClass: StreetClass;
}

export interface Plaza {
    readonly rect: Rect;
    readonly fountain: Circle;
}

export interface Park {
    readonly rect: Rect;
    readonly trees: readonly Circle[];
}

export interface CityEdge {
    readonly side: Side;
    readonly kind: 'park' | 'river';
}

/** Walkable zones of the navigation grid, plus `blocked` for buildings, kiosks, the fountain, trees and the edge. */
export const ZONE = {
    blocked: 0,
    alley: 1,
    street: 2,
    avenue: 3,
    boulevard: 4,
    plaza: 5,
    park: 6,
    /** Never left in a generated city: the tests check that every cell gets a zone. */
    unassigned: 255
} as const;

export type Zone = (typeof ZONE)[keyof typeof ZONE];

export const ZONE_OF_CLASS: Readonly<Record<StreetClass, Zone>> = {
    alley: ZONE.alley,
    street: ZONE.street,
    avenue: ZONE.avenue,
    boulevard: ZONE.boulevard
};

export interface City {
    readonly seed: number;
    /** The walkable city spans `[-halfSize, halfSize]` on both axes; its border is a wall. */
    readonly halfSize: number;
    /** Streets, avenues and boulevards, the perimeter ring included. Intersections overlap. */
    readonly roads: readonly Road[];
    readonly alleys: readonly Road[];
    /** Every block between roads, the plaza and park blocks included. */
    readonly blocks: readonly Rect[];
    readonly buildings: readonly Building[];
    readonly kioskSpots: readonly KioskSpot[];
    readonly plaza: Plaza;
    readonly park: Park;
    readonly edges: readonly CityEdge[];
    /** Where Benny starts: in the plaza, south of the fountain. */
    readonly spawn: Point;
    readonly nav: NavGrid;
}
