import { CITY, KIOSKS } from '../../config/tuning';
import type { StreetClass } from '../../config/tuning';
import { Rng } from '../rng';

import { NavGrid } from './navgrid';
import type { Building, City, CityEdge, Circle, KioskSpot, Park, Plaza, Point, Rect, Road, Side } from './types';
import { ZONE, ZONE_OF_CLASS } from './types';

/** A road line across one axis: its centre coordinate and class. */
interface Line {
    readonly centre: number;
    readonly streetClass: StreetClass;
}

/** A building lot: its footprint, the sides that face a road, and whether it ends its row (a block corner). */
interface Lot {
    readonly rect: Rect;
    readonly fronts: readonly Side[];
    readonly cornerLot: boolean;
}

const widthOf = (streetClass: StreetClass): number => CITY.streetClasses[streetClass].widthMetres;
const halfWidthOf = (streetClass: StreetClass): number => widthOf(streetClass) / 2;
const rectWidth = (r: Rect): number => r.x1 - r.x0;
const rectDepth = (r: Rect): number => r.z1 - r.z0;
const rectCentre = (r: Rect): Point => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
const hasArea = (r: Rect): boolean => r.x1 > r.x0 && r.z1 > r.z0;
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Avenues and boulevards across one axis: the perimeter ring on both edges, and evenly spaced, jittered majors in
 * between, one or two of them boulevards.
 */
function placeMajors(rng: Rng, half: number): Line[] {
    const first = -half + halfWidthOf('avenue');
    const last = half - halfWidthOf('avenue');
    const span = last - first;
    const intervals = Math.max(1, Math.round(span / CITY.avenueSpacingMetres));
    const interior: number[] = [];
    for (let k = 1; k < intervals; k++) {
        interior.push(
            Math.round(first + (span * k) / intervals) + rng.int(-CITY.majorJitterMetres, CITY.majorJitterMetres)
        );
    }
    const boulevardCount = Math.min(interior.length, rng.int(CITY.boulevardsPerAxis.min, CITY.boulevardsPerAxis.max));
    const boulevards = new Set(rng.shuffle(interior.map((_, i) => i)).slice(0, boulevardCount));
    return [
        { centre: first, streetClass: 'avenue' },
        ...interior.map((centre, i): Line => ({ centre, streetClass: boulevards.has(i) ? 'boulevard' : 'avenue' })),
        { centre: last, streetClass: 'avenue' }
    ];
}

/** Whether streets at `centres` leave every block between `start` and `end` at least the minimum block size. */
function blocksWideEnough(centres: readonly number[], start: number, end: number): boolean {
    let edge = start;
    for (const c of centres) {
        if (c - halfWidthOf('street') - edge < CITY.minBlockMetres) {
            return false;
        }
        edge = c + halfWidthOf('street');
    }
    return end - edge >= CITY.minBlockMetres;
}

/** Street centres in the gap between two neighbouring majors, roughly every street spacing. */
function placeStreets(rng: Rng, a: Line, b: Line): number[] {
    const start = a.centre + halfWidthOf(a.streetClass);
    const end = b.centre - halfWidthOf(b.streetClass);
    for (let k = Math.max(0, Math.round((b.centre - a.centre) / CITY.streetSpacingMetres) - 1); k > 0; k--) {
        const even = Array.from({ length: k }, (_, j) => Math.round(start + ((end - start) * (j + 1)) / (k + 1)));
        const jittered = even.map((c) => c + rng.int(-CITY.streetJitterMetres, CITY.streetJitterMetres));
        if (blocksWideEnough(jittered, start, end)) {
            return jittered;
        }
        if (blocksWideEnough(even, start, end)) {
            return even;
        }
    }
    return [];
}

/** Intervals between `start` and `end`, cut out by roads of the given class at `centres`. */
function intervalsBetween(start: number, end: number, centres: readonly number[], streetClass: StreetClass) {
    const out: [number, number][] = [];
    let edge = start;
    for (const c of [...centres].sort((p, q) => p - q)) {
        out.push([edge, c - halfWidthOf(streetClass)]);
        edge = c + halfWidthOf(streetClass);
    }
    out.push([edge, end]);
    return out;
}

/** Cuts a block (or the part of it beside an alley) into building lots, in one row or two rows back to back. */
function cutLots(rng: Rng, block: Rect): Lot[] {
    const alongX = rectWidth(block) >= rectDepth(block);
    const depthLo = alongX ? block.z0 : block.x0;
    const depthHi = alongX ? block.z1 : block.x1;
    const lo = alongX ? block.x0 : block.z0;
    const hi = alongX ? block.x1 : block.z1;
    const [nearSide, farSide]: [Side, Side] = alongX ? ['north', 'south'] : ['west', 'east'];

    const rows: { from: number; to: number; fronts: Side[] }[] =
        depthHi - depthLo >= CITY.twoRowMinDepthMetres
            ? [
                  { from: depthLo, to: Math.round((depthLo + depthHi) / 2), fronts: [nearSide] },
                  { from: Math.round((depthLo + depthHi) / 2), to: depthHi, fronts: [farSide] }
              ]
            : [{ from: depthLo, to: depthHi, fronts: [nearSide, farSide] }];

    const lots: Lot[] = [];
    for (const row of rows) {
        const cuts: number[] = [lo];
        let pos = lo;
        while (hi - pos > CITY.lotWidthMetres.max) {
            let w = rng.int(CITY.lotWidthMetres.min, CITY.lotWidthMetres.max);
            if (hi - pos - w < CITY.lotWidthMetres.min) {
                w = hi - pos - CITY.lotWidthMetres.min;
            }
            pos += w;
            cuts.push(pos);
        }
        cuts.push(hi);
        for (let i = 0; i + 1 < cuts.length; i++) {
            const a = cuts[i];
            const b = cuts[i + 1];
            const rect: Rect = alongX
                ? { x0: a, z0: row.from, x1: b, z1: row.to }
                : { x0: row.from, z0: a, x1: row.to, z1: b };
            lots.push({ rect, fronts: row.fronts, cornerLot: i === 0 || i + 2 === cuts.length });
        }
    }
    return lots;
}

/** The kiosk footprint, the facade pieces around its notch, its door zone and facing, for one side of a lot. */
function carveKiosk(lot: Rect, side: Side): { kiosk: Rect; pieces: Rect[]; doorZone: Rect; facing: Point } {
    const f = KIOSKS.footprintMetres;
    const door = KIOSKS.doorZoneDepthMetres;
    const { x0, z0, x1, z1 } = lot;
    if (side === 'north' || side === 'south') {
        const kx0 = Math.floor((x0 + x1) / 2) - f / 2;
        const kx1 = kx0 + f;
        const north = side === 'north';
        const front = north ? z0 : z1;
        const back = north ? z0 + f : z1 - f;
        const stripLo = Math.min(front, back);
        const stripHi = Math.max(front, back);
        return {
            kiosk: { x0: kx0, z0: stripLo, x1: kx1, z1: stripHi },
            pieces: [
                north ? { x0, z0: back, x1, z1 } : { x0, z0, x1, z1: back },
                { x0, z0: stripLo, x1: kx0, z1: stripHi },
                { x0: kx1, z0: stripLo, x1, z1: stripHi }
            ].filter(hasArea),
            doorZone: north
                ? { x0: kx0, z0: front - door, x1: kx1, z1: front }
                : { x0: kx0, z0: front, x1: kx1, z1: front + door },
            facing: { x: 0, z: north ? -1 : 1 }
        };
    }
    const kz0 = Math.floor((z0 + z1) / 2) - f / 2;
    const kz1 = kz0 + f;
    const west = side === 'west';
    const front = west ? x0 : x1;
    const back = west ? x0 + f : x1 - f;
    const stripLo = Math.min(front, back);
    const stripHi = Math.max(front, back);
    return {
        kiosk: { x0: stripLo, z0: kz0, x1: stripHi, z1: kz1 },
        pieces: [
            west ? { x0: back, z0, x1, z1 } : { x0, z0, x1: back, z1 },
            { x0: stripLo, z0, x1: stripHi, z1: kz0 },
            { x0: stripLo, z0: kz1, x1: stripHi, z1 }
        ].filter(hasArea),
        doorZone: west
            ? { x0: front - door, z0: kz0, x1: front, z1: kz1 }
            : { x0: front, z0: kz0, x1: front + door, z1: kz1 },
        facing: { x: west ? -1 : 1, z: 0 }
    };
}

/** Writes `value` into every cell whose centre lies inside or on the border of `rect`. */
function paintRect(zone: Uint8Array, half: number, rect: Rect, value: number): void {
    const size = 2 * half + 1;
    const c0 = Math.max(0, Math.ceil(rect.x0) + half);
    const c1 = Math.min(size - 1, Math.floor(rect.x1) + half);
    const r0 = Math.max(0, Math.ceil(rect.z0) + half);
    const r1 = Math.min(size - 1, Math.floor(rect.z1) + half);
    for (let row = r0; row <= r1; row++) {
        zone.fill(value, row * size + c0, row * size + c1 + 1);
    }
}

/** Writes `value` into every cell whose centre lies inside or on `circle`. */
function paintCircle(zone: Uint8Array, half: number, circle: Circle, value: number): void {
    const size = 2 * half + 1;
    const r = circle.radius;
    for (let z = Math.ceil(circle.z - r); z <= Math.floor(circle.z + r); z++) {
        for (let x = Math.ceil(circle.x - r); x <= Math.floor(circle.x + r); x++) {
            const col = x + half;
            const row = z + half;
            if (col >= 0 && row >= 0 && col < size && row < size && Math.hypot(x - circle.x, z - circle.z) <= r) {
                zone[row * size + col] = value;
            }
        }
    }
}

/** The zone of the cell just outside a lot's side, on the road it faces. */
function zoneOutside(zone: Uint8Array, half: number, lot: Rect, side: Side): number {
    const size = 2 * half + 1;
    const c = rectCentre(lot);
    const x = side === 'west' ? lot.x0 - 1 : side === 'east' ? lot.x1 + 1 : Math.round(c.x);
    const z = side === 'north' ? lot.z0 - 1 : side === 'south' ? lot.z1 + 1 : Math.round(c.z);
    const col = x + half;
    const row = z + half;
    return col < 0 || row < 0 || col >= size || row >= size ? ZONE.blocked : zone[row * size + col];
}

function chooseEdges(rng: Rng): CityEdge[] {
    const sides: Side[] = ['north', 'east', 'south', 'west'];
    const first = rng.int(0, 3);
    const riverCount = rng.int(CITY.riverSides.min, CITY.riverSides.max);
    const river = new Set<number>([first]);
    if (riverCount > 1) {
        river.add((first + (rng.chance(0.5) ? 1 : 3)) % 4);
    }
    return sides.map((side, i) => ({ side, kind: river.has(i) ? 'river' : 'park' }));
}

/**
 * Generates the city for a seed (design: *The city*). The same seed always gives the same city.
 *
 * Avenues and boulevards, the perimeter ring included, run from edge to edge, so they form one connected network.
 * Streets run in spans from one major road to the next, so both ends of every street meet the network; a few spans are
 * left out to vary the block sizes. Alleys cross about half the blocks from one road to the opposite one. Buildings
 * fill the remaining blocks without gaps, so the only ways through are the roads, the alleys, the plaza and the park.
 */
export function generateCity(seed: number): City {
    const root = new Rng(seed);
    const layoutRng = root.fork();
    const blockRng = root.fork();
    const lotRng = root.fork();
    const kioskRng = root.fork();
    const edgeRng = root.fork();

    const half = CITY.sizeMetres / 2;
    const size = 2 * half + 1;
    let nextId = 0;

    // Major roads, then streets between them, across both axes
    const colMajors = placeMajors(layoutRng, half);
    const rowMajors = placeMajors(layoutRng, half);
    const colStreets = colMajors.slice(0, -1).map((a, i) => placeStreets(layoutRng, a, colMajors[i + 1]));
    const rowStreets = rowMajors.slice(0, -1).map((a, i) => placeStreets(layoutRng, a, rowMajors[i + 1]));

    const roads: Road[] = [];
    for (const m of colMajors) {
        const hw = halfWidthOf(m.streetClass);
        const rect = { x0: m.centre - hw, z0: -half, x1: m.centre + hw, z1: half };
        roads.push({
            id: nextId++,
            streetClass: m.streetClass,
            axis: 'z',
            centre: m.centre,
            from: -half,
            to: half,
            rect
        });
    }
    for (const m of rowMajors) {
        const hw = halfWidthOf(m.streetClass);
        const rect = { x0: -half, z0: m.centre - hw, x1: half, z1: m.centre + hw };
        roads.push({
            id: nextId++,
            streetClass: m.streetClass,
            axis: 'x',
            centre: m.centre,
            from: -half,
            to: half,
            rect
        });
    }

    // Each cell between neighbouring majors keeps or drops each of its street spans, and splits into blocks
    const blocks: Rect[] = [];
    const sw = halfWidthOf('street');
    for (let i = 0; i + 1 < colMajors.length; i++) {
        const xStart = colMajors[i].centre + halfWidthOf(colMajors[i].streetClass);
        const xEnd = colMajors[i + 1].centre - halfWidthOf(colMajors[i + 1].streetClass);
        for (let j = 0; j + 1 < rowMajors.length; j++) {
            const zStart = rowMajors[j].centre + halfWidthOf(rowMajors[j].streetClass);
            const zEnd = rowMajors[j + 1].centre - halfWidthOf(rowMajors[j + 1].streetClass);
            const cols = colStreets[i].filter(() => layoutRng.chance(CITY.streetSpanKeepShare));
            const rows = rowStreets[j].filter(() => layoutRng.chance(CITY.streetSpanKeepShare));
            for (const c of cols) {
                const rect = { x0: c - sw, z0: zStart, x1: c + sw, z1: zEnd };
                roads.push({ id: nextId++, streetClass: 'street', axis: 'z', centre: c, from: zStart, to: zEnd, rect });
            }
            for (const r of rows) {
                const rect = { x0: xStart, z0: r - sw, x1: xEnd, z1: r + sw };
                roads.push({ id: nextId++, streetClass: 'street', axis: 'x', centre: r, from: xStart, to: xEnd, rect });
            }
            for (const [x0, x1] of intervalsBetween(xStart, xEnd, cols, 'street')) {
                for (const [z0, z1] of intervalsBetween(zStart, zEnd, rows, 'street')) {
                    blocks.push({ x0, z0, x1, z1 });
                }
            }
        }
    }

    // Landmarks: the plaza is the block nearest the centre; the park is one of the larger blocks far from it
    const origin: Point = { x: 0, z: 0 };
    const plazaBlock = blocks.reduce((best, b) =>
        distance(rectCentre(b), origin) < distance(rectCentre(best), origin) ? b : best
    );
    const plazaCentre = rectCentre(plazaBlock);
    const farBlocks = blocks.filter(
        (b) => b !== plazaBlock && distance(rectCentre(b), plazaCentre) >= CITY.avenueSpacingMetres
    );
    const parkPool = (farBlocks.length > 0 ? farBlocks : blocks.filter((b) => b !== plazaBlock))
        .slice()
        .sort((a, b) => rectWidth(b) * rectDepth(b) - rectWidth(a) * rectDepth(a));
    const parkBlock = blockRng.pick(parkPool.slice(0, Math.max(1, Math.ceil(parkPool.length / 3))));

    const fountainCentre = { x: Math.round(plazaCentre.x), z: Math.round(plazaCentre.z) };
    const plaza: Plaza = {
        rect: plazaBlock,
        fountain: { ...fountainCentre, radius: CITY.fountainRadiusMetres }
    };
    const trees: Circle[] = [];
    const { spacingMetres, radiusMetres, marginMetres } = CITY.parkTrees;
    const treeArea = {
        x0: parkBlock.x0 + marginMetres,
        z0: parkBlock.z0 + marginMetres,
        x1: parkBlock.x1 - marginMetres,
        z1: parkBlock.z1 - marginMetres
    };
    const treeCols = Math.max(1, Math.floor(rectWidth(treeArea) / spacingMetres) + 1);
    const treeRows = Math.max(1, Math.floor(rectDepth(treeArea) / spacingMetres) + 1);
    for (let r = 0; r < treeRows; r++) {
        for (let c = 0; c < treeCols; c++) {
            const x =
                treeCols === 1 ? rectCentre(treeArea).x : treeArea.x0 + (rectWidth(treeArea) * c) / (treeCols - 1);
            const z =
                treeRows === 1 ? rectCentre(treeArea).z : treeArea.z0 + (rectDepth(treeArea) * r) / (treeRows - 1);
            trees.push({
                x: Math.round(x) + blockRng.int(-1, 1),
                z: Math.round(z) + blockRng.int(-1, 1),
                radius: radiusMetres
            });
        }
    }
    const park: Park = { rect: parkBlock, trees };

    // Alleys across about half the other blocks; what is left of each block is cut into lots
    const alleys: Road[] = [];
    const lotAreas: Rect[] = [];
    const aw = halfWidthOf('alley');
    for (const block of blocks) {
        if (block === plazaBlock || block === parkBlock) {
            continue;
        }
        const alongX = rectWidth(block) >= rectDepth(block);
        const span = alongX ? rectWidth(block) : rectDepth(block);
        const lo = (alongX ? block.x0 : block.z0) + CITY.alleyMinOffsetMetres + aw;
        const hi = (alongX ? block.x1 : block.z1) - CITY.alleyMinOffsetMetres - aw;
        if (span >= 2 * (CITY.alleyMinOffsetMetres + aw) && hi >= lo && blockRng.chance(CITY.alleyBlockShare)) {
            const c = blockRng.int(lo, hi);
            if (alongX) {
                const rect = { x0: c - aw, z0: block.z0, x1: c + aw, z1: block.z1 };
                alleys.push({
                    id: nextId++,
                    streetClass: 'alley',
                    axis: 'z',
                    centre: c,
                    from: block.z0,
                    to: block.z1,
                    rect
                });
                lotAreas.push({ ...block, x1: c - aw }, { ...block, x0: c + aw });
            } else {
                const rect = { x0: block.x0, z0: c - aw, x1: block.x1, z1: c + aw };
                alleys.push({
                    id: nextId++,
                    streetClass: 'alley',
                    axis: 'x',
                    centre: c,
                    from: block.x0,
                    to: block.x1,
                    rect
                });
                lotAreas.push({ ...block, z1: c - aw }, { ...block, z0: c + aw });
            }
        } else {
            lotAreas.push(block);
        }
    }

    // Paint the roads first, so lots can tell which road each of their sides faces
    const zone = new Uint8Array(size * size).fill(ZONE.unassigned);
    const byWidth = [...alleys, ...roads].sort((a, b) => widthOf(a.streetClass) - widthOf(b.streetClass));
    for (const road of byWidth) {
        paintRect(zone, half, road.rect, ZONE_OF_CLASS[road.streetClass]);
    }

    const lots = lotAreas.flatMap((area) => cutLots(lotRng, area));

    // Kiosk spots: lots facing a street or an avenue, away from block corners, spread out as far as possible
    const candidates: { lot: number; side: Side; centre: Point }[] = [];
    lots.forEach((lot, index) => {
        const alongX = lot.fronts.includes('north') || lot.fronts.includes('south');
        const frontage = alongX ? rectWidth(lot.rect) : rectDepth(lot.rect);
        if (lot.cornerLot || frontage < KIOSKS.footprintMetres + 2) {
            return;
        }
        for (const side of lot.fronts) {
            const outside = zoneOutside(zone, half, lot.rect, side);
            if (outside === ZONE.street || outside === ZONE.avenue) {
                candidates.push({ lot: index, side, centre: rectCentre(lot.rect) });
            }
        }
    });
    const chosen: typeof candidates = [];
    if (candidates.length > 0) {
        chosen.push(kioskRng.pick(candidates));
    }
    while (chosen.length < KIOSKS.count) {
        let best = -1;
        let bestDistance = -1;
        candidates.forEach((cand, i) => {
            if (chosen.some((c) => c.lot === cand.lot)) {
                return;
            }
            const d = Math.min(...chosen.map((c) => distance(c.centre, cand.centre)));
            if (d > bestDistance) {
                best = i;
                bestDistance = d;
            }
        });
        if (best < 0) {
            break;
        }
        chosen.push(candidates[best]);
    }

    // Buildings: one per lot, or the facade pieces around a kiosk notch
    const kioskSpots: KioskSpot[] = [];
    const buildings: Building[] = [];
    const kioskLots = new Map(chosen.map((c) => [c.lot, c.side]));
    let clockTower = -1;
    let clockTowerDistance = Infinity;
    lots.forEach((lot, index) => {
        const height = lotRng.int(CITY.buildingHeightMetres.min, CITY.buildingHeightMetres.max);
        const colorIndex = lotRng.int(0, 1023);
        const side = kioskLots.get(index);
        if (side === undefined) {
            const d = distance(rectCentre(lot.rect), plazaCentre);
            if (d < clockTowerDistance) {
                clockTowerDistance = d;
                clockTower = buildings.length;
            }
            buildings.push({ rect: lot.rect, height, colorIndex });
            return;
        }
        const carved = carveKiosk(lot.rect, side);
        for (const piece of carved.pieces) {
            buildings.push({ rect: piece, height, colorIndex });
        }
        const outside = zoneOutside(zone, half, lot.rect, side);
        kioskSpots.push({
            rect: carved.kiosk,
            facing: carved.facing,
            doorZone: carved.doorZone,
            roadClass: outside === ZONE.avenue ? 'avenue' : 'street'
        });
    });
    if (clockTower >= 0) {
        buildings[clockTower] = {
            ...buildings[clockTower],
            height: CITY.clockTowerHeightMetres,
            landmark: 'clockTower'
        };
    }

    // Open spaces, then everything solid
    paintRect(zone, half, plaza.rect, ZONE.plaza);
    paintRect(zone, half, park.rect, ZONE.park);
    for (const b of buildings) {
        paintRect(zone, half, b.rect, ZONE.blocked);
    }
    for (const k of kioskSpots) {
        paintRect(zone, half, k.rect, ZONE.blocked);
    }
    paintCircle(zone, half, plaza.fountain, ZONE.blocked);
    for (const t of trees) {
        paintCircle(zone, half, t, ZONE.blocked);
    }
    for (let i = 0; i < size; i++) {
        zone[i] = ZONE.blocked;
        zone[(size - 1) * size + i] = ZONE.blocked;
        zone[i * size] = ZONE.blocked;
        zone[i * size + size - 1] = ZONE.blocked;
    }

    const spawn: Point = { x: fountainCentre.x, z: fountainCentre.z + CITY.fountainRadiusMetres + 3 };

    return {
        seed: root.seed,
        halfSize: half,
        roads,
        alleys,
        blocks,
        buildings,
        kioskSpots,
        plaza,
        park,
        edges: chooseEdges(edgeRng),
        spawn,
        nav: new NavGrid(half, zone)
    };
}
