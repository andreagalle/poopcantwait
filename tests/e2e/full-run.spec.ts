import { expect, test } from '@playwright/test';
import type { Entity } from 'playcanvas';

import { generateCity } from '../../src/core/city/generate';
import type { Point } from '../../src/core/city/types';

import { openGame, SCREENSHOT_DIR } from './helpers';

/** The seed of the scripted run. */
const SEED = 42;
/**
 * The route is planned for a Benny this wide, in metres: wider than a slim Benny (0.9 m), so it keeps clear of walls
 * and corners he would scrape.
 */
const PLANNING_DIAMETER = 1.6;
/** Distance fields mark unreachable cells with this instead of `Infinity`, which JSON cannot carry. */
const UNREACHABLE = 1e9;

/**
 * Plans the way to the nearest kiosk in the seeded city with the game's own rules: the walking-distance field from
 * that kiosk's door (`NavGrid.pathDistances`). Following it downhill from anywhere leads to the door.
 */
function planToNearestKiosk(seed: number) {
    const city = generateCity(seed);
    const nav = city.nav;
    const doorOf = (i: number): Point => {
        const zone = city.kioskSpots[i]!.doorZone;
        return { x: (zone.x0 + zone.x1) / 2, z: (zone.z0 + zone.z1) / 2 };
    };
    const fromSpawn = nav.pathDistances(city.spawn, PLANNING_DIAMETER);
    const reachable = city.kioskSpots
        .map((_, i) => ({ i, distance: fromSpawn[nav.cellAt(doorOf(i).x, doorOf(i).z)]! }))
        .filter((k) => Number.isFinite(k.distance))
        .sort((a, b) => a.distance - b.distance);
    const target = reachable[0]!;
    const field = nav.pathDistances(doorOf(target.i), PLANNING_DIAMETER);
    return {
        door: doorOf(target.i),
        metres: target.distance,
        halfSize: nav.halfSize,
        size: nav.size,
        field: Array.from(field, (d) => (Number.isFinite(d) ? Math.round(d * 100) / 100 : UNREACHABLE))
    };
}

test('plays a seeded run to a kiosk by following the arrow keys there, and gets relief', async ({ page }) => {
    // Software rendering runs the simulation slowly: walking about a hundred metres can take minutes
    test.setTimeout(420_000);
    const plan = planToNearestKiosk(SEED);
    expect(plan.metres).toBeLessThan(400);

    // A long countdown, so the run is about reaching the toilet, not about the clock
    const errors = await openGame(page, `?seed=${SEED}&countdown=600`);
    await expect(page.locator('.hud-score')).toHaveText('0');

    // In the page, every frame: find Benny's cell, look a few cells down the distance field towards the door, and hold
    // the arrow keys that point there (eight directions, as a player would). Stops when relief starts.
    const outcome = await page.evaluate(
        ({ plan, unreachable, timeoutMs }) =>
            new Promise<{ relieved: boolean; seconds: number; left: number }>((resolve) => {
                const app = [...globalThis.__playcanvasApps!.keys()][0]!;
                const benny = app.root.findByName('benny') as Entity;
                const { field, halfSize, size } = plan;
                const cellAt = (x: number, z: number) => {
                    const col = Math.round(x) + halfSize;
                    const row = Math.round(z) + halfSize;
                    return col < 0 || row < 0 || col >= size || row >= size ? -1 : row * size + col;
                };
                const downhill = (cell: number) => {
                    let best = cell;
                    for (const step of [-size - 1, -size, -size + 1, -1, 1, size - 1, size, size + 1]) {
                        const next = cell + step;
                        if (next >= 0 && next < field.length && field[next]! < field[best]!) {
                            best = next;
                        }
                    }
                    return best;
                };
                const held = new Set<string>();
                const hold = (keys: string[]) => {
                    for (const key of [...held]) {
                        if (!keys.includes(key)) {
                            window.dispatchEvent(new KeyboardEvent('keyup', { key }));
                            held.delete(key);
                        }
                    }
                    for (const key of keys) {
                        if (!held.has(key)) {
                            window.dispatchEvent(new KeyboardEvent('keydown', { key }));
                            held.add(key);
                        }
                    }
                };
                const started = performance.now();
                const finish = (relieved: boolean) => {
                    hold([]);
                    const p = benny.getPosition();
                    const left = field[cellAt(p.x, p.z)] ?? unreachable;
                    resolve({ relieved, seconds: (performance.now() - started) / 1000, left });
                };
                const frame = () => {
                    if (document.querySelector('.relief-pop')) {
                        finish(true);
                        return;
                    }
                    if (performance.now() - started > timeoutMs) {
                        finish(false);
                        return;
                    }
                    const p = benny.getPosition();
                    let cell = cellAt(p.x, p.z);
                    // Knocked off the planned way (a car, a squeeze into a tight spot): head back to the nearest cell
                    // on it first, rather than straight at the door through the buildings
                    if (cell >= 0 && field[cell]! >= unreachable) {
                        const col = cell % size;
                        let nearest = -1;
                        let best = Infinity;
                        for (let dr = -4; dr <= 4; dr++) {
                            for (let dc = -4; dc <= 4; dc++) {
                                const c = cell + dr * size + dc;
                                const d = dr * dr + dc * dc;
                                if (col + dc >= 0 && col + dc < size && c >= 0 && c < field.length) {
                                    if (field[c]! < unreachable && d < best) {
                                        best = d;
                                        nearest = c;
                                    }
                                }
                            }
                        }
                        if (nearest >= 0) {
                            cell = nearest;
                        }
                    }
                    let aim = { x: plan.door.x, z: plan.door.z };
                    if (cell >= 0 && field[cell]! < unreachable && cellAt(p.x, p.z) !== cell) {
                        aim = { x: (cell % size) - halfSize, z: Math.floor(cell / size) - halfSize };
                    } else if (cell >= 0 && field[cell]! < unreachable && field[cell]! > 0.5) {
                        // Aim three cells ahead along the way, which smooths the zigzag of single cells
                        for (let i = 0; i < 3; i++) {
                            cell = downhill(cell);
                        }
                        aim = { x: (cell % size) - halfSize, z: Math.floor(cell / size) - halfSize };
                    }
                    const dx = aim.x - p.x;
                    const dz = aim.z - p.z;
                    const length = Math.hypot(dx, dz);
                    const keys: string[] = [];
                    // Eight directions: press a key when its axis carries at least 40% of the way
                    if (length > 0.15) {
                        if (dx > 0.4 * length) keys.push('ArrowRight');
                        if (dx < -0.4 * length) keys.push('ArrowLeft');
                        if (dz > 0.4 * length) keys.push('ArrowDown');
                        if (dz < -0.4 * length) keys.push('ArrowUp');
                    }
                    // At the door: stand still and wait for the kiosk to be free
                    hold(field[cellAt(p.x, p.z)]! <= 0.5 ? [] : keys);
                    requestAnimationFrame(frame);
                };
                requestAnimationFrame(frame);
            }),
        { plan, unreachable: UNREACHABLE, timeoutMs: 360_000 }
    );
    expect(outcome.relieved, JSON.stringify({ ...outcome, door: plan.door, metres: plan.metres })).toBe(true);

    // Relief: "Phew!", the relief points with the clutch bonus, and a fresh countdown
    await page.screenshot({ path: `${SCREENSHOT_DIR}/full-run-relief.png` });
    await expect.poll(async () => Number(await page.locator('.hud-score').textContent())).toBeGreaterThanOrEqual(250);
    await expect(page.locator('.hud-seconds')).toHaveText('600', { timeout: 30_000 });
    await expect(page.locator('.underpants.is-soiled')).toHaveCount(0);
    expect(errors).toEqual([]);
});
