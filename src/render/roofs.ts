import { Color } from 'playcanvas';

import { CITY } from '../config/tuning';
import { hashInts } from '../core/city/hash';
import type { Roof } from '../core/city/roofs';
import type { Building } from '../core/city/types';

import { SLOT, slotUv } from './facades';
import type { MeshBuilder } from './mesh-builder';

type Vec = readonly [number, number, number];

const hex = (value: string): Color => new Color().fromString(value);
/** Roof colours (design: *Art direction*): terracotta tiles, slate, brick, the greys of the machines, soil and leaves. */
const COLOURS = {
    terracotta: hex('#c8643c'),
    slate: hex('#6b7a90'),
    brick: hex('#b0624a'),
    machine: hex('#cfd2d4'),
    grille: hex('#5c6166'),
    tank: hex('#9aa1a6'),
    wood: hex('#8d6e63'),
    soil: hex('#5d4a3c'),
    leaf: hex('#6ab04c'),
    pumpkin: hex('#f08a24'),
    glass: hex('#cfe7ef')
};
/** The size of a felt roof tile cell on a slope, in metres: each slope gets a whole number of them. */
const TILE_METRES = 2.5;
/** Parapets round flat roofs: their height and thickness, in metres. */
const PARAPET = { height: 0.4, thickness: 0.25 };

const lerp = (a: Vec, b: Vec, t: number): Vec => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
];

/**
 * A slope covered in felt roof tiles: the quad from `bl` (bottom left, seen from outside) round to `tl`, cut into cells
 * of about `TILE_METRES`, each showing the whole tile.
 */
function addTiled(mesh: MeshBuilder, bl: Vec, br: Vec, tr: Vec, tl: Vec, colour: Color): void {
    const across = Math.max(1, Math.round(Math.hypot(br[0] - bl[0], br[1] - bl[1], br[2] - bl[2]) / TILE_METRES));
    const up = Math.max(1, Math.round(Math.hypot(tl[0] - bl[0], tl[1] - bl[1], tl[2] - bl[2]) / TILE_METRES));
    const uv = slotUv(SLOT.roofTiles);
    for (let i = 0; i < across; i++) {
        for (let j = 0; j < up; j++) {
            const at = (u: number, v: number): Vec => lerp(lerp(bl, br, u), lerp(tl, tr, u), v);
            mesh.addFace(
                [
                    at(i / across, j / up),
                    at((i + 1) / across, j / up),
                    at((i + 1) / across, (j + 1) / up),
                    at(i / across, (j + 1) / up)
                ],
                colour,
                uv
            );
        }
    }
}

/** A gable-ended prism roof over a rectangle, its ridge along x or z, covered in tiles; its gables in the wall colour. */
function addPitched(
    mesh: MeshBuilder,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    ridge: number,
    alongX: boolean,
    tiles: Color,
    gable: Color
): void {
    if (alongX) {
        const zc = (z0 + z1) / 2;
        addTiled(mesh, [x0, y, z1], [x1, y, z1], [x1, y + ridge, zc], [x0, y + ridge, zc], tiles);
        addTiled(mesh, [x1, y, z0], [x0, y, z0], [x0, y + ridge, zc], [x1, y + ridge, zc], tiles);
        mesh.addFace(
            [
                [x0, y, z0],
                [x0, y, z1],
                [x0, y + ridge, zc]
            ],
            gable
        );
        mesh.addFace(
            [
                [x1, y, z1],
                [x1, y, z0],
                [x1, y + ridge, zc]
            ],
            gable
        );
    } else {
        const xc = (x0 + x1) / 2;
        addTiled(mesh, [x1, y, z1], [x1, y, z0], [xc, y + ridge, z0], [xc, y + ridge, z1], tiles);
        addTiled(mesh, [x0, y, z0], [x0, y, z1], [xc, y + ridge, z1], [xc, y + ridge, z0], tiles);
        mesh.addFace(
            [
                [x1, y, z0],
                [x0, y, z0],
                [xc, y + ridge, z0]
            ],
            gable
        );
        mesh.addFace(
            [
                [x0, y, z1],
                [x1, y, z1],
                [xc, y + ridge, z1]
            ],
            gable
        );
    }
}

/** An air-conditioning unit, its fan grille on the side facing +z. */
function addAcUnit(mesh: MeshBuilder, x: number, z: number, y: number): void {
    mesh.addBox(x - 0.45, y, z - 0.3, x + 0.45, y + 0.7, z + 0.3, COLOURS.machine);
    mesh.addFace(
        [
            [x - 0.25, y + 0.15, z + 0.31],
            [x + 0.25, y + 0.15, z + 0.31],
            [x + 0.25, y + 0.55, z + 0.31],
            [x - 0.25, y + 0.55, z + 0.31]
        ],
        COLOURS.grille
    );
}

/** A water tank on four legs, with a conical lid. */
function addWaterTank(mesh: MeshBuilder, x: number, z: number, y: number): void {
    for (const [dx, dz] of [
        [-0.45, -0.45],
        [0.45, -0.45],
        [-0.45, 0.45],
        [0.45, 0.45]
    ]) {
        mesh.addBox(x + dx - 0.06, y, z + dz - 0.06, x + dx + 0.06, y + 0.8, z + dz + 0.06, COLOURS.grille);
    }
    mesh.addCylinder(x, z, 0.65, y + 0.8, y + 2, COLOURS.tank, 12);
    mesh.addCone(x, z, 0.72, y + 2, y + CITY.roofs.tankMetres, COLOURS.tank, 12);
}

/** A raised bed of vegetables along x, its plants in a row. */
function addGardenBed(mesh: MeshBuilder, x: number, z: number, y: number, seed: number): void {
    mesh.addBox(x - 1.2, y, z - 0.45, x + 1.2, y + 0.45, z + 0.45, COLOURS.wood, COLOURS.soil);
    for (let i = 0; i < 4; i++) {
        const px = x - 0.9 + i * 0.6;
        if (hashInts(seed, i) % 5 === 0) {
            mesh.addCylinder(px, z, 0.2, y + 0.45, y + 0.72, COLOURS.pumpkin, 8);
        } else {
            mesh.addCone(px, z, 0.24, y + 0.45, y + 0.9, COLOURS.leaf, 6);
        }
    }
}

/** A small greenhouse with a pitched glass roof, its ridge along x. */
function addGreenhouse(mesh: MeshBuilder, x: number, z: number, y: number): void {
    mesh.addBox(x - 1, y, z - 0.8, x + 1, y + 1.3, z + 0.8, COLOURS.glass, COLOURS.glass);
    addPitched(
        mesh,
        x - 1,
        z - 0.8,
        x + 1,
        z + 0.8,
        y + 1.3,
        CITY.roofs.greenhouseMetres - 1.3,
        true,
        COLOURS.glass,
        COLOURS.glass
    );
}

/** A low wall round a flat roof, in the building's colour. */
function addParapet(mesh: MeshBuilder, b: Building, wall: Color): void {
    const { x0, z0, x1, z1 } = b.rect;
    const y = b.height;
    const t = PARAPET.thickness;
    const top = y + PARAPET.height;
    mesh.addBox(x0, y, z0, x1, top, z0 + t, wall);
    mesh.addBox(x0, y, z1 - t, x1, top, z1, wall);
    mesh.addBox(x0, y, z0 + t, x0 + t, top, z1 - t, wall);
    mesh.addBox(x1 - t, y, z0 + t, x1, top, z1 - t, wall);
}

/**
 * A building's roof (`roofOf`), drawn into its own piece so it fades with it: a flat roof with a parapet, its
 * air-conditioning units and maybe a water tank; a vegetable garden with raised beds and a greenhouse; a pitched roof of
 * felt tiles with brick chimneys; or a mansard of slate with dormer windows. Everything takes the felt grain of the atlas.
 */
export function addRoof(mesh: MeshBuilder, b: Building, index: number, roof: Roof, wall: Color, top: Color): void {
    const { x0, z0, x1, z1 } = b.rect;
    const y = b.height;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const width = x1 - x0;
    const depth = z1 - z0;
    switch (roof.kind) {
        case 'pitched': {
            addPitched(mesh, x0, z0, x1, z1, y, roof.ridgeMetres, roof.ridgeAlongX, COLOURS.terracotta, wall);
            // One or two chimneys, on the ridge's first half and maybe its second
            const chimneys = 1 + (hashInts(index, 10) % 2);
            for (let i = 0; i < chimneys; i++) {
                const t = chimneys === 1 ? 0.3 : 0.25 + 0.5 * i;
                const px = roof.ridgeAlongX ? x0 + width * t : cx + width * 0.18;
                const pz = roof.ridgeAlongX ? cz + depth * 0.18 : z0 + depth * t;
                const h = y + roof.ridgeMetres + CITY.roofs.chimneyMetres;
                mesh.addBox(px - 0.35, y, pz - 0.35, px + 0.35, h, pz + 0.35, COLOURS.brick);
            }
            return;
        }
        case 'mansard': {
            const inset = Math.min(1.6, Math.min(width, depth) * 0.2);
            const h = y + CITY.roofs.mansardMetres;
            const [a0, b0, a1, b1] = [x0 + inset, z0 + inset, x1 - inset, z1 - inset];
            addTiled(mesh, [x0, y, z1], [x1, y, z1], [a1, h, b1], [a0, h, b1], COLOURS.slate);
            addTiled(mesh, [x1, y, z0], [x0, y, z0], [a0, h, b0], [a1, h, b0], COLOURS.slate);
            addTiled(mesh, [x1, y, z1], [x1, y, z0], [a1, h, b0], [a1, h, b1], COLOURS.slate);
            addTiled(mesh, [x0, y, z0], [x0, y, z1], [a0, h, b1], [a0, h, b0], COLOURS.slate);
            mesh.addGroundRect(a0, b0, a1, b1, h, COLOURS.slate);
            // Dormers along the two long sides, one every 3 m or so, each a window in a box under a little roof
            const alongX = width >= depth;
            const length = alongX ? width : depth;
            const count = Math.max(1, Math.floor((length - 2) / 3));
            const window = slotUv(SLOT.windowClosed);
            for (let i = 0; i < count; i++) {
                const s = (alongX ? x0 : z0) + (length * (i + 0.5)) / count;
                for (const side of [-1, 1]) {
                    const face = alongX ? (side > 0 ? z1 : z0) : side > 0 ? x1 : x0;
                    const front = face - side * inset * 0.35;
                    const back = face - side * inset * 0.9;
                    const [lo, hi] = [y + 0.25, y + 1.45];
                    if (alongX) {
                        const [za, zb] = [Math.min(front, back), Math.max(front, back)];
                        mesh.addBox(s - 0.55, lo, za, s + 0.55, hi, zb, wall);
                        const z = front + side * 0.01;
                        const corners: Vec[] =
                            side > 0
                                ? [
                                      [s - 0.55, lo, z],
                                      [s + 0.55, lo, z],
                                      [s + 0.55, hi, z],
                                      [s - 0.55, hi, z]
                                  ]
                                : [
                                      [s + 0.55, lo, z],
                                      [s - 0.55, lo, z],
                                      [s - 0.55, hi, z],
                                      [s + 0.55, hi, z]
                                  ];
                        mesh.addFace(corners, wall, window);
                        addPitched(mesh, s - 0.65, za, s + 0.65, zb, hi, 0.45, false, COLOURS.slate, wall);
                    } else {
                        const [xa, xb] = [Math.min(front, back), Math.max(front, back)];
                        mesh.addBox(xa, lo, s - 0.55, xb, hi, s + 0.55, wall);
                        const x = front + side * 0.01;
                        const corners: Vec[] =
                            side > 0
                                ? [
                                      [x, lo, s + 0.55],
                                      [x, lo, s - 0.55],
                                      [x, hi, s - 0.55],
                                      [x, hi, s + 0.55]
                                  ]
                                : [
                                      [x, lo, s - 0.55],
                                      [x, lo, s + 0.55],
                                      [x, hi, s + 0.55],
                                      [x, hi, s - 0.55]
                                  ];
                        mesh.addFace(corners, wall, window);
                        addPitched(mesh, xa, s - 0.65, xb, s + 0.65, hi, 0.45, true, COLOURS.slate, wall);
                    }
                }
            }
            return;
        }
        case 'garden': {
            mesh.addGroundRect(x0, z0, x1, z1, y, top);
            addParapet(mesh, b, wall);
            // Beds in rows along x, the greenhouse in a corner
            const rows = Math.max(1, Math.floor((depth - 2) / 1.8));
            const beds = Math.max(1, Math.floor((width - 3.5) / 2.8));
            for (let j = 0; j < rows; j++) {
                for (let i = 0; i < beds; i++) {
                    addGardenBed(mesh, x0 + 1 + 1.2 + i * 2.8, z0 + 1.2 + j * 1.8, y, hashInts(index, i, j));
                }
            }
            addGreenhouse(mesh, x1 - 1.6, z1 - 1.3, y);
            return;
        }
        case 'flat': {
            mesh.addGroundRect(x0, z0, x1, z1, y, top);
            addParapet(mesh, b, wall);
            for (let i = 0; i < roof.acUnits; i++) {
                const t = (i + 1) / (roof.acUnits + 1);
                addAcUnit(mesh, x0 + width * t, z0 + Math.min(1.2, depth * 0.3), y);
            }
            if (roof.waterTank) {
                addWaterTank(mesh, x1 - Math.min(1.5, width * 0.3), z1 - Math.min(1.5, depth * 0.3), y);
            }
            return;
        }
        default:
            mesh.addGroundRect(x0, z0, x1, z1, y, top);
    }
}
