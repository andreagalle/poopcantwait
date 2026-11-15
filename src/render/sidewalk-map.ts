import { sidewalksOf } from '../core/city/sidewalks';
import type { City } from '../core/city/types';

/** How high the sidewalks stand above the road, in metres: a kerb's height. */
export const SIDEWALK_HEIGHT = 0.1;

/** The grid's cells, in metres: sidewalk edges lie on half metres. */
const CELL = 0.5;

/**
 * Where the raised sidewalks are, on a half-metre grid: the height of the ground under a point, so Benny, the pop-ups
 * and the street furniture stand on the sidewalk rather than sink into it (presentation only).
 */
export class SidewalkMap {
    private readonly side: number;
    private readonly half: number;
    private readonly raised: Uint8Array;

    constructor(city: City) {
        this.half = city.halfSize;
        this.side = Math.ceil((2 * city.halfSize) / CELL);
        this.raised = new Uint8Array(this.side * this.side);
        for (const { rect: r } of sidewalksOf(city)) {
            for (let row = this.cell(r.z0); row < this.cell(r.z1); row++) {
                for (let col = this.cell(r.x0); col < this.cell(r.x1); col++) {
                    if (row >= 0 && col >= 0 && row < this.side && col < this.side) {
                        this.raised[row * this.side + col] = 1;
                    }
                }
            }
        }
    }

    private cell(v: number): number {
        return Math.round((v + this.half) / CELL);
    }

    /** The ground's height under a point: the sidewalk's, or 0 on the road and everywhere else. */
    heightAt(x: number, z: number): number {
        const col = Math.floor((x + this.half) / CELL);
        const row = Math.floor((z + this.half) / CELL);
        if (col < 0 || row < 0 || col >= this.side || row >= this.side) {
            return 0;
        }
        return this.raised[row * this.side + col] === 1 ? SIDEWALK_HEIGHT : 0;
    }
}
