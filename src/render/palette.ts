import { Color } from 'playcanvas';

import type { StreetClass } from '../config/tuning';

const hex = (value: string): Color => new Color().fromString(value);

/**
 * The toy-town greybox palette (design: *Art direction*): soft pastel buildings, roads that darken as they widen so
 * the street classes read at a glance from the high camera, clear colours per role.
 */
export const PALETTE = {
    buildings: ['#f4c7c3', '#f9e0a8', '#c8e6c9', '#b3e5fc', '#d1c4e9', '#ffe0b2', '#f8bbd0', '#dcedc8'].map(hex),
    roofTint: 0.92,
    clockTower: hex('#c96f53'),
    clockTowerRoof: hex('#5d6d7e'),
    roads: {
        alley: hex('#d8c8b0'),
        street: hex('#b0b0b4'),
        avenue: hex('#93979f'),
        boulevard: hex('#7a8698')
    } satisfies Record<StreetClass, Color>,
    cityGround: hex('#c9c3b8'),
    plaza: hex('#eadcc0'),
    fountainStone: hex('#d8d0c4'),
    water: hex('#7cc4e8'),
    grass: hex('#9ccc65'),
    treeTrunk: hex('#8d6e63'),
    treeCanopy: hex('#5fae62'),
    kiosk: hex('#f5f3ee'),
    kioskDoor: hex('#90a4ae'),
    beaconFree: hex('#3ddc84'),
    beaconOccupied: hex('#ff4d4d'),
    parkland: hex('#8bc34a'),
    riverbank: hex('#d7c79e'),
    river: hex('#5fa8d3'),
    hedge: hex('#558b2f'),
    railing: hex('#e0e0e0')
} as const;
