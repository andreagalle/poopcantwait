import { CITY } from '../../config/tuning';

import { hashInts } from './hash';
import type { Building } from './types';

/** The kinds of roof (design: *Art direction*): each building gets one. */
export type RoofKind = 'flat' | 'garden' | 'pitched' | 'mansard' | 'tower';

/** A building's roof: its kind, its details, and how far it rises above the walls at its highest, in metres. */
export interface Roof {
    readonly kind: RoofKind;
    readonly rise: number;
    /** A pitched roof's ridge runs along x (else along z) and stands this high above the walls. */
    readonly ridgeAlongX: boolean;
    readonly ridgeMetres: number;
    /** A flat roof's air-conditioning units, and whether it has a water tank. */
    readonly acUnits: number;
    readonly waterTank: boolean;
}

/**
 * A building's roof, from its index alone (no random numbers): a flat roof with air conditioning and maybe a water tank,
 * a rooftop vegetable garden with a greenhouse, a pitched roof of tiles with chimneys, or a mansard with dormers. Narrow
 * buildings get only flat or pitched roofs; the clock tower keeps its spire.
 */
export function roofOf(b: Building, index: number): Roof {
    const r = b.rect;
    const width = r.x1 - r.x0;
    const depth = r.z1 - r.z0;
    const {
        weights,
        narrowMetres,
        maxRidgeMetres,
        ridgeSlope,
        chimneyMetres,
        mansardMetres,
        greenhouseMetres,
        tankMetres
    } = CITY.roofs;
    const base = { ridgeAlongX: width >= depth, ridgeMetres: 0, acUnits: 0, waterTank: false };
    if (b.landmark === 'clockTower') {
        return { ...base, kind: 'tower', rise: CITY.clockTowerSpireMetres };
    }
    const narrow = Math.min(width, depth) < narrowMetres;
    const kinds: { kind: RoofKind; weight: number }[] = narrow
        ? [
              { kind: 'flat', weight: weights.flat },
              { kind: 'pitched', weight: weights.pitched }
          ]
        : [
              { kind: 'flat', weight: weights.flat },
              { kind: 'garden', weight: weights.garden },
              { kind: 'pitched', weight: weights.pitched },
              { kind: 'mansard', weight: weights.mansard }
          ];
    const total = kinds.reduce((sum, k) => sum + k.weight, 0);
    let roll = hashInts(index, 7) % total;
    const kind = kinds.find((k) => (roll -= k.weight) < 0)!.kind;
    switch (kind) {
        case 'pitched': {
            const ridge = Math.min(maxRidgeMetres, (ridgeSlope * Math.min(width, depth)) / 2);
            return { ...base, kind, ridgeMetres: ridge, rise: ridge + chimneyMetres };
        }
        case 'mansard':
            return { ...base, kind, rise: mansardMetres };
        case 'garden':
            return { ...base, kind, rise: greenhouseMetres };
        default: {
            const waterTank = hashInts(index, 8) % 2 === 0;
            return {
                ...base,
                kind,
                acUnits: 1 + (hashInts(index, 9) % 3),
                waterTank,
                rise: waterTank ? tankMetres : 1
            };
        }
    }
}
