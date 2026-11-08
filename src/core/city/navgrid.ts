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
     */
    pathDistances(from: Point, diameter: number, maxDistance = Infinity): Float64Array {
        const count = this.size * this.size;
        const distance = new Float64Array(count).fill(Infinity);
        const radius = diameter / 2;
        const start = this.cellAt(from.x, from.z);
        if (start < 0 || !(this.clearance[start] > radius)) {
            return distance;
        }

        const size = this.size;
        const clearance = this.clearance;
        const fits = (cell: number) => clearance[cell] > radius;
        const heap = new CellHeap(1024);
        distance[start] = 0;
        heap.push(start, 0);

        while (heap.size > 0) {
            const cell = heap.pop();
            const d = heap.lastKey;
            if (d > distance[cell] || d > maxDistance) {
                continue;
            }
            const col = cell % size;
            const row = (cell - col) / size;
            const west = col > 0;
            const east = col < size - 1;
            const north = row > 0;
            const south = row < size - 1;
            const fitsW = west && fits(cell - 1);
            const fitsE = east && fits(cell + 1);
            const fitsN = north && fits(cell - size);
            const fitsS = south && fits(cell + size);

            const relax = (next: number, step: number) => {
                const nd = d + step;
                if (nd < distance[next] && nd <= maxDistance) {
                    distance[next] = nd;
                    heap.push(next, nd);
                }
            };
            if (fitsW) {
                relax(cell - 1, 1);
            }
            if (fitsE) {
                relax(cell + 1, 1);
            }
            if (fitsN) {
                relax(cell - size, 1);
            }
            if (fitsS) {
                relax(cell + size, 1);
            }
            if (fitsN && fitsW && fits(cell - size - 1)) {
                relax(cell - size - 1, SQRT2);
            }
            if (fitsN && fitsE && fits(cell - size + 1)) {
                relax(cell - size + 1, SQRT2);
            }
            if (fitsS && fitsW && fits(cell + size - 1)) {
                relax(cell + size - 1, SQRT2);
            }
            if (fitsS && fitsE && fits(cell + size + 1)) {
                relax(cell + size + 1, SQRT2);
            }
        }
        return distance;
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

    /** Shortest walking distance between two points for a Benny of this diameter, or `Infinity`. */
    pathDistance(from: Point, to: Point, diameter: number): number {
        const target = this.cellAt(to.x, to.z);
        if (target < 0) {
            return Infinity;
        }
        return this.pathDistances(from, diameter)[target];
    }
}
