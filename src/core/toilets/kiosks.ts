import { DIFFICULTY, KIOSKS } from '../../config/tuning';
import type { Rect } from '../city/types';
import type { Rng } from '../rng';

/**
 * Public toilet kiosks (design: *Public toilet kiosks*): each one cycles between free and occupied for random times,
 * and the occupied times grow as the run goes on (design: *Difficulty over time*).
 */
export type KioskStatus = 'free' | 'occupied';

export interface KioskState {
    readonly status: KioskStatus;
    /** Seconds until the status flips. */
    readonly secondsLeft: number;
}

/** Factor on occupied times after `elapsedSeconds` of the run: +10% a minute, at most twice as long. */
export function occupiedFactor(elapsedSeconds: number): number {
    const grown = 1 + DIFFICULTY.kioskOccupiedGrowthPerMinute * (Math.max(0, elapsedSeconds) / 60);
    return Math.min(DIFFICULTY.kioskOccupiedMaxFactor, grown);
}

function freeTime(rng: Rng): number {
    return rng.range(KIOSKS.freeSeconds.min, KIOSKS.freeSeconds.max);
}

function occupiedTime(rng: Rng, elapsedSeconds: number): number {
    return rng.range(KIOSKS.occupiedSeconds.min, KIOSKS.occupiedSeconds.max) * occupiedFactor(elapsedSeconds);
}

/** Starting states: each kiosk somewhere in its cycle, free in proportion to the average free and occupied times. */
export function initialKiosks(count: number, rng: Rng): KioskState[] {
    const meanFree = (KIOSKS.freeSeconds.min + KIOSKS.freeSeconds.max) / 2;
    const meanOccupied = (KIOSKS.occupiedSeconds.min + KIOSKS.occupiedSeconds.max) / 2;
    return Array.from({ length: count }, () => {
        const free = rng.chance(meanFree / (meanFree + meanOccupied));
        const full = free ? freeTime(rng) : occupiedTime(rng, 0);
        return { status: free ? 'free' : 'occupied', secondsLeft: rng.range(0, full) };
    });
}

/** Advances every kiosk by `dt`; a kiosk whose time runs out flips and draws its next duration. */
export function tickKiosks(
    kiosks: readonly KioskState[],
    dt: number,
    rng: Rng,
    elapsedSeconds: number
): { kiosks: KioskState[]; flipped: number[] } {
    const flipped: number[] = [];
    const next = kiosks.map((k, i): KioskState => {
        const secondsLeft = k.secondsLeft - dt;
        if (secondsLeft > 0) {
            return { ...k, secondsLeft };
        }
        flipped.push(i);
        return k.status === 'free'
            ? { status: 'occupied', secondsLeft: occupiedTime(rng, elapsedSeconds) }
            : { status: 'free', secondsLeft: freeTime(rng) };
    });
    return { kiosks: next, flipped };
}

/** The kiosk Benny just used: occupied for a while (5 to 10 s, growing with the run like every occupied time). */
export function occupyAfterUse(rng: Rng, elapsedSeconds: number): KioskState {
    const { min, max } = KIOSKS.occupiedAfterUseSeconds;
    return { status: 'occupied', secondsLeft: rng.range(min, max) * occupiedFactor(elapsedSeconds) };
}

/** Whether a circle comes within `reach` of a rectangle (Benny touching a door zone). */
export function circleNearRect(x: number, z: number, radius: number, rect: Rect, reach: number): boolean {
    const dx = x - Math.min(Math.max(x, rect.x0), rect.x1);
    const dz = z - Math.min(Math.max(z, rect.z0), rect.z1);
    return Math.hypot(dx, dz) <= radius + reach;
}
