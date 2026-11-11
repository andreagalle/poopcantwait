import type { Circle, City, Rect } from '../city/types';

/** Side of a spatial hash cell, in metres. */
const CELL = 8;
/** Push-out passes per step: a corner touches two walls, a narrow gap three or four. */
const PASSES = 4;
/** Overlap still allowed after resolving, in metres. */
const EPSILON = 1e-6;

/** Everything solid in the city, indexed for quick lookups around a point. */
export interface CollisionWorld {
    readonly halfSize: number;
    readonly rects: readonly Rect[];
    readonly circles: readonly Circle[];
    /** Spatial hash: for each cell key, the indices of the rects and circles touching it. */
    readonly cells: ReadonlyMap<number, { rects: number[]; circles: number[] }>;
}

export interface Contact {
    /** Unit normal pointing away from the obstacle, towards the circle. */
    readonly nx: number;
    readonly nz: number;
}

const key = (cx: number, cz: number): number => (cx + 1024) * 4096 + (cz + 1024);

function insert(
    cells: Map<number, { rects: number[]; circles: number[] }>,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    add: (entry: { rects: number[]; circles: number[] }) => void
): void {
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
            const k = key(cx, cz);
            let entry = cells.get(k);
            if (!entry) {
                entry = { rects: [], circles: [] };
                cells.set(k, entry);
            }
            add(entry);
        }
    }
}

/** Builds the collision world of a city: buildings and kiosks as rectangles, the fountain and trees as circles. */
export function buildCollisionWorld(city: City): CollisionWorld {
    const rects = [...city.buildings.map((b) => b.rect), ...city.kioskSpots.map((k) => k.rect)];
    const circles = [city.plaza.fountain, ...city.park.trees];
    const cells = new Map<number, { rects: number[]; circles: number[] }>();
    rects.forEach((r, i) => insert(cells, r.x0, r.z0, r.x1, r.z1, (e) => e.rects.push(i)));
    circles.forEach((c, i) =>
        insert(cells, c.x - c.radius, c.z - c.radius, c.x + c.radius, c.z + c.radius, (e) => e.circles.push(i))
    );
    return { halfSize: city.halfSize, rects, circles, cells };
}

/** The obstacles whose hash cells overlap the square of half-side `reach` around a point. */
function nearby(
    world: CollisionWorld,
    x: number,
    z: number,
    reach: number
): { rects: Set<number>; circles: Set<number> } {
    const rects = new Set<number>();
    const circles = new Set<number>();
    for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) {
        for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++) {
            const entry = world.cells.get(key(cx, cz));
            if (entry) {
                entry.rects.forEach((i) => rects.add(i));
                entry.circles.forEach((i) => circles.add(i));
            }
        }
    }
    return { rects, circles };
}

/** How deep a circle overlaps the world (0 when it is free), measured against every nearby obstacle. */
export function overlapDepth(world: CollisionWorld, x: number, z: number, radius: number): number {
    let depth = Math.max(0, radius - (world.halfSize - Math.abs(x)), radius - (world.halfSize - Math.abs(z)));
    const { rects, circles } = nearby(world, x, z, radius);
    for (const i of rects) {
        const r = world.rects[i];
        const dx = x - Math.min(Math.max(x, r.x0), r.x1);
        const dz = z - Math.min(Math.max(z, r.z0), r.z1);
        const inside = dx === 0 && dz === 0 && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
        depth = Math.max(depth, inside ? radius : radius - Math.hypot(dx, dz));
    }
    for (const i of circles) {
        const c = world.circles[i];
        depth = Math.max(depth, radius + c.radius - Math.hypot(x - c.x, z - c.z));
    }
    return depth;
}

/**
 * Pushes a circle out of every obstacle it overlaps, in a few passes, and reports the contact normals. The result can
 * still overlap when the circle does not fit where it is (wider than a street); check it with `overlapDepth`.
 */
export function pushOut(
    world: CollisionWorld,
    x: number,
    z: number,
    radius: number
): { x: number; z: number; contacts: Contact[] } {
    const contacts: Contact[] = [];
    const { rects, circles } = nearby(world, x, z, 2 * radius + 1);
    for (let pass = 0; pass < PASSES; pass++) {
        let moved = false;
        for (const i of rects) {
            const r = world.rects[i];
            const qx = Math.min(Math.max(x, r.x0), r.x1);
            const qz = Math.min(Math.max(z, r.z0), r.z1);
            let dx = x - qx;
            let dz = z - qz;
            let distance = Math.hypot(dx, dz);
            if (distance >= radius - EPSILON) {
                continue;
            }
            if (distance === 0) {
                // The centre is inside the rectangle: leave through the nearest side
                const exits = [
                    { d: x - r.x0, nx: -1, nz: 0 },
                    { d: r.x1 - x, nx: 1, nz: 0 },
                    { d: z - r.z0, nx: 0, nz: -1 },
                    { d: r.z1 - z, nx: 0, nz: 1 }
                ].sort((a, b) => a.d - b.d)[0];
                dx = exits.nx;
                dz = exits.nz;
                distance = -exits.d;
                x += dx * (radius - distance);
                z += dz * (radius - distance);
                contacts.push({ nx: dx, nz: dz });
            } else {
                const nx = dx / distance;
                const nz = dz / distance;
                x += nx * (radius - distance);
                z += nz * (radius - distance);
                contacts.push({ nx, nz });
            }
            moved = true;
        }
        for (const i of circles) {
            const c = world.circles[i];
            const dx = x - c.x;
            const dz = z - c.z;
            const distance = Math.hypot(dx, dz);
            const reach = radius + c.radius;
            if (distance >= reach - EPSILON) {
                continue;
            }
            const nx = distance > 0 ? dx / distance : 0;
            const nz = distance > 0 ? dz / distance : 1;
            x = c.x + nx * reach;
            z = c.z + nz * reach;
            contacts.push({ nx, nz });
            moved = true;
        }
        // The city border is a wall
        const limit = world.halfSize - radius;
        if (x < -limit || x > limit) {
            contacts.push({ nx: x < 0 ? 1 : -1, nz: 0 });
            x = Math.min(Math.max(x, -limit), limit);
            moved = true;
        }
        if (z < -limit || z > limit) {
            contacts.push({ nx: 0, nz: z < 0 ? 1 : -1 });
            z = Math.min(Math.max(z, -limit), limit);
            moved = true;
        }
        if (!moved) {
            break;
        }
    }
    return { x, z, contacts };
}
