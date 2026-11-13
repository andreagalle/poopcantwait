import { distanceTransform } from './edt';
import type { Point, Zone } from './types';
import { ZONE } from './types';

const SQRT2 = Math.SQRT2;

/** Binary min-heap of grid cells keyed by distance, with lazy deletion (stale entries are skipped by the caller). */
class CellHeap {
    private cells: Int32Array;
    private keys: Float64Array;
    size = 0;

    constructor(capacity: number) {
        this.cells = new Int32Array(capacity);
        this.keys = new Float64Array(capacity);
    }

    push(cell: number, key: number): void {
        if (this.size === this.cells.length) {
            const cells = new Int32Array(this.size * 2);
            const keys = new Float64Array(this.size * 2);
            cells.set(this.cells);
            keys.set(this.keys);
            this.cells = cells;
            this.keys = keys;
        }
        let i = this.size++;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.keys[parent] <= key) {
                break;
            }
            this.cells[i] = this.cells[parent];
            this.keys[i] = this.keys[parent];
            i = parent;
        }
        this.cells[i] = cell;
        this.keys[i] = key;
    }

    /** Removes the cell with the smallest key and returns it; read its key with `lastKey`. */
    pop(): number {
        const top = this.cells[0];
        this.lastKey = this.keys[0];
        const cell = this.cells[--this.size];
        const key = this.keys[this.size];
        let i = 0;
        for (;;) {
            let child = 2 * i + 1;
            if (child >= this.size) {
                break;
            }
            if (child + 1 < this.size && this.keys[child + 1] < this.keys[child]) {
                child++;
            }
            if (this.keys[child] >= key) {
                break;
            }
            this.cells[i] = this.cells[child];
            this.keys[i] = this.keys[child];
            i = child;
        }
        this.cells[i] = cell;
        this.keys[i] = key;
        return top;
    }

    lastKey = 0;
}

/**
 * The city on a grid of 1 m cells whose centres sit on whole-metre coordinates, from `-halfSize` to `halfSize` on both
 * axes. Each cell has a zone (walkable street class, plaza, park, or blocked) and a clearance: the distance from its
 * centre to the nearest blocked cell centre. Because every edge in the city lies on whole metres, the clearance is the
 * exact distance to the nearest wall: 3 m in the middle of a 6 m street, 1 m in the middle of a 2 m alley.
 *
 * Benny, a circle of diameter `d`, fits on a cell when its clearance is greater than `d / 2`.
 */
export class NavGrid {
    readonly halfSize: number;
    /** Cells per side. */
    readonly size: number;
    readonly zone: Uint8Array;
    readonly clearance: Float32Array;
    /** The search of `pathDistances`, kept between calls so its heap grows once instead of on every search. */
    private readonly search: PathSearch = new PathSearch(this);

    /** Builds the clearance field of `zone` (a `size` by `size` grid, row-major from the north-west corner). */
    constructor(halfSize: number, zone: Uint8Array) {
        if (!Number.isInteger(halfSize) || halfSize <= 0) {
            throw new RangeError(`halfSize must be a positive integer, got ${halfSize}`);
        }
        this.halfSize = halfSize;
        this.size = 2 * halfSize + 1;
        if (zone.length !== this.size * this.size) {
            throw new RangeError(`expected ${this.size * this.size} cells, got ${zone.length}`);
        }
        this.zone = zone;
        const blocked = new Uint8Array(zone.length);
        for (let i = 0; i < zone.length; i++) {
            blocked[i] = zone[i] === ZONE.blocked || zone[i] === ZONE.unassigned ? 1 : 0;
        }
        this.clearance = distanceTransform(blocked, this.size, this.size);
    }

    /** Index of the cell nearest to a world point, or -1 outside the grid. */
    cellAt(x: number, z: number): number {
        const col = Math.round(x) + this.halfSize;
        const row = Math.round(z) + this.halfSize;
        if (col < 0 || row < 0 || col >= this.size || row >= this.size) {
            return -1;
        }
        return row * this.size + col;
    }

    /** World coordinates of a cell centre. */
    centreOf(cell: number): Point {
        return { x: (cell % this.size) - this.halfSize, z: Math.floor(cell / this.size) - this.halfSize };
    }

    zoneAt(x: number, z: number): Zone {
        const cell = this.cellAt(x, z);
        return cell < 0 ? ZONE.blocked : (this.zone[cell] as Zone);
    }

    clearanceAt(x: number, z: number): number {
        const cell = this.cellAt(x, z);
        return cell < 0 ? 0 : this.clearance[cell];
    }

    /** Whether a Benny of this diameter fits on the cell nearest to the point. */
    canStand(x: number, z: number, diameter: number): boolean {
        return this.clearanceAt(x, z) > diameter / 2;
    }

    /**
     * Shortest walking distance, in metres, from `from` to every cell for a Benny of diameter `diameter`, moving
     * between neighbouring cells (diagonals cost √2 and may not cut corners). Unreachable cells, and every cell when
     * Benny does not fit at `from`, get `Infinity`. Stops expanding beyond `maxDistance`.
     *
     * It allocates nothing per cell: pass `out` (a grid-sized array) to reuse it, and the search heap lives on the grid
     * between calls. To spread one search over several frames, use a `PathSearch` instead.
     */
    pathDistances(from: Point, diameter: number, maxDistance = Infinity, out?: Float64Array): Float64Array {
        this.search.begin(from, diameter, maxDistance, out);
        this.search.advance(Infinity);
        return this.search.distances;
    }

    /**
     * The cell centre nearest to `point` (in a straight line) where a Benny of this diameter fits, or `null` when he
     * fits nowhere. Used to place him at the start and when he grows too wide for where he stands.
     */
    nearestStandable(point: Point, diameter: number): Point | null {
        const radius = diameter / 2;
        let best = -1;
        let bestDistance = Infinity;
        for (let cell = 0; cell < this.clearance.length; cell++) {
            if (this.clearance[cell] > radius) {
                const c = this.centreOf(cell);
                const d = (c.x - point.x) ** 2 + (c.z - point.z) ** 2;
                if (d < bestDistance) {
                    bestDistance = d;
                    best = cell;
                }
            }
        }
        return best < 0 ? null : this.centreOf(best);
    }

    /**
     * The nearest cell, walking through open ground from `point` (never through walls), where a Benny of this diameter
     * fits; `null` when there is none. Used when he grows too wide for where he stands: he is squeezed out along the
     * passage he is in, not across a building.
     */
    nearestRoomy(point: Point, diameter: number): Point | null {
        const start = this.cellAt(point.x, point.z);
        if (start < 0) {
            return null;
        }
        const radius = diameter / 2;
        const size = this.size;
        const seen = new Uint8Array(this.clearance.length);
        const queue = new Int32Array(this.clearance.length);
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        seen[start] = 1;
        while (head < tail) {
            const cell = queue[head++];
            if (this.clearance[cell] > radius) {
                return this.centreOf(cell);
            }
            const col = cell % size;
            const neighbours = [col > 0 ? cell - 1 : -1, col < size - 1 ? cell + 1 : -1, cell - size, cell + size];
            for (const next of neighbours) {
                if (next >= 0 && next < this.clearance.length && !seen[next] && this.clearance[next] > 0) {
                    seen[next] = 1;
                    queue[tail++] = next;
                }
            }
        }
        return null;
    }

    /** Shortest walking distance between two points for a Benny of this diameter, or `Infinity`. */
    pathDistance(from: Point, to: Point, diameter: number): number {
        const target = this.cellAt(to.x, to.z);
        if (target < 0) {
            return Infinity;
        }
        return this.pathDistances(from, diameter)[target];
    }
}

/**
 * A walking-distance search (`NavGrid.pathDistances`) that can run a slice at a time: `begin` sets it up, each
 * `advance(budget)` settles at most `budget` cells, and `done` tells when every reachable cell has its distance. The
 * game spreads one search over several simulation steps, so no single frame pays for all of it (`NAVIGATION`); the
 * budget counts cells, not time, so the result and the step it completes on are the same on every machine.
 */
export class PathSearch {
    /** The distances found so far, final once `done`: the `out` array given to `begin`, or a new one. */
    distances: Float64Array = new Float64Array(0);
    /** Whether the search has finished (also before the first `begin`). */
    done = true;
    private readonly nav: NavGrid;
    private readonly heap = new CellHeap(1024);
    private radius = 0;
    private maxDistance = Infinity;

    constructor(nav: NavGrid) {
        this.nav = nav;
    }

    /** Starts a search from `from` for a Benny of diameter `diameter`, dropping any search in progress. */
    begin(from: Point, diameter: number, maxDistance = Infinity, out?: Float64Array): void {
        const count = this.nav.size * this.nav.size;
        this.distances = out && out.length === count ? out : new Float64Array(count);
        this.distances.fill(Infinity);
        this.radius = diameter / 2;
        this.maxDistance = maxDistance;
        this.heap.size = 0;
        const start = this.nav.cellAt(from.x, from.z);
        if (start < 0 || !(this.nav.clearance[start] > this.radius)) {
            this.done = true;
            return;
        }
        this.distances[start] = 0;
        this.heap.push(start, 0);
        this.done = false;
    }

    /** Settles up to `budget` more cells (`Infinity` for the rest of the search) and returns `done`. */
    advance(budget: number): boolean {
        if (this.done) {
            return true;
        }
        const distance = this.distances;
        const clearance = this.nav.clearance;
        const size = this.nav.size;
        const count = size * size;
        const heap = this.heap;
        const radius = this.radius;
        const maxDistance = this.maxDistance;
        while (heap.size > 0 && budget > 0) {
            budget--;
            const cell = heap.pop();
            const d = heap.lastKey;
            if (d > distance[cell] || d > maxDistance) {
                continue;
            }
            const col = cell % size;
            const fitsW = col > 0 && clearance[cell - 1] > radius;
            const fitsE = col < size - 1 && clearance[cell + 1] > radius;
            const fitsN = cell >= size && clearance[cell - size] > radius;
            const fitsS = cell < count - size && clearance[cell + size] > radius;
            const straight = d + 1;
            if (straight <= maxDistance) {
                if (fitsW && straight < distance[cell - 1]) {
                    distance[cell - 1] = straight;
                    heap.push(cell - 1, straight);
                }
                if (fitsE && straight < distance[cell + 1]) {
                    distance[cell + 1] = straight;
                    heap.push(cell + 1, straight);
                }
                if (fitsN && straight < distance[cell - size]) {
                    distance[cell - size] = straight;
                    heap.push(cell - size, straight);
                }
                if (fitsS && straight < distance[cell + size]) {
                    distance[cell + size] = straight;
                    heap.push(cell + size, straight);
                }
            }
            const diagonal = d + SQRT2;
            if (diagonal <= maxDistance) {
                // A diagonal step needs both side cells free too, so Benny never cuts a corner
                let next = cell - size - 1;
                if (fitsN && fitsW && clearance[next] > radius && diagonal < distance[next]) {
                    distance[next] = diagonal;
                    heap.push(next, diagonal);
                }
                next = cell - size + 1;
                if (fitsN && fitsE && clearance[next] > radius && diagonal < distance[next]) {
                    distance[next] = diagonal;
                    heap.push(next, diagonal);
                }
                next = cell + size - 1;
                if (fitsS && fitsW && clearance[next] > radius && diagonal < distance[next]) {
                    distance[next] = diagonal;
                    heap.push(next, diagonal);
                }
                next = cell + size + 1;
                if (fitsS && fitsE && clearance[next] > radius && diagonal < distance[next]) {
                    distance[next] = diagonal;
                    heap.push(next, diagonal);
                }
            }
        }
        this.done = heap.size === 0;
        return this.done;
    }
}
