import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AppBase, Entity } from 'playcanvas';

import { CAMERA, WEIGHT } from '../../src/config/tuning';

declare global {
    // Filled by the devtools hook of the inspect-runtime skill: every live PlayCanvas app (engine 2.23+)
    var __playcanvasApps: Map<AppBase, unknown> | undefined;
}

const DEVTOOLS_HOOK = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../.claude/skills/inspect-runtime/scripts/devtools-hook.js'
);

const SCREENSHOT_DIR = 'tmp/screenshots';
/** AGENTS.md, Testing and verification: under 300 draw calls in a busy scene. */
const DRAW_CALL_BUDGET = 300;

/** Opens the game and collects console errors and uncaught exceptions while the test runs. */
async function openGame(page: Page, query = ''): Promise<string[]> {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript({ path: DEVTOOLS_HOOK });
    await page.goto(`./${query}`);
    await page.waitForFunction(() => (globalThis.__playcanvasApps?.size ?? 0) > 0);
    return errors;
}

/**
 * Copies the canvas right after a rendered frame, before the browser clears the WebGL drawing buffer, and measures how
 * varied its colours are. A blank canvas has a single colour.
 */
function sampleCanvas(page: Page) {
    return page.evaluate(
        () =>
            new Promise<{ distinctColors: number; dominantShare: number; drawCalls: number }>((resolve) => {
                const app = [...globalThis.__playcanvasApps!.keys()][0]!;
                let frames = 0;
                const onFrameEnd = () => {
                    frames++;
                    if (frames < 5) {
                        return;
                    }
                    app.off('frameend', onFrameEnd);
                    const size = 96;
                    const copy = document.createElement('canvas');
                    copy.width = size;
                    copy.height = size;
                    const context = copy.getContext('2d')!;
                    context.drawImage(app.graphicsDevice.canvas, 0, 0, size, size);
                    const pixels = context.getImageData(0, 0, size, size).data;
                    const counts = new Map<number, number>();
                    for (let i = 0; i < pixels.length; i += 4) {
                        // 5 bits per channel, so dithering and antialiasing noise do not count as colours
                        const key = ((pixels[i]! >> 3) << 10) | ((pixels[i + 1]! >> 3) << 5) | (pixels[i + 2]! >> 3);
                        counts.set(key, (counts.get(key) ?? 0) + 1);
                    }
                    resolve({
                        distinctColors: counts.size,
                        dominantShare: Math.max(...counts.values()) / (size * size),
                        drawCalls: app.stats.drawCalls.total
                    });
                };
                app.on('frameend', onFrameEnd);
            })
    );
}

test('loads without console errors and renders the city around Benny', async ({ page }) => {
    // A different city every run, but a known one: a failure names the seed that reproduces it
    const seed = Math.floor(Math.random() * 2 ** 32);
    test.info().annotations.push({ type: 'seed', description: String(seed) });
    const errors = await openGame(page, `?seed=${seed}`);

    await expect(page).toHaveTitle('Gotta Go!');
    await expect(page.getByText('Gotta Go! (work in progress)')).toBeVisible();
    await expect(page.locator('.debug-map')).toHaveCount(0);

    const sample = await sampleCanvas(page);
    test.info().annotations.push({ type: 'canvas', description: JSON.stringify(sample) });
    expect(sample.distinctColors, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    expect(sample.dominantShare, `seed ${seed}`).toBeLessThan(0.99);
    expect(sample.drawCalls, `seed ${seed}`).toBeLessThan(DRAW_CALL_BUDGET);

    // The city is built, and the camera looks down at Benny from the design angle and distance
    const view = await page.evaluate(() => {
        const app = [...globalThis.__playcanvasApps!.keys()][0]!;
        const camera = app.root.findByName('camera') as Entity;
        const benny = app.root.findByName('benny') as Entity;
        const buildings = app.root.findByName('city-buildings') as Entity;
        const forward = camera.forward;
        return {
            pitchDegrees: (Math.asin(-forward.y) * 180) / Math.PI,
            yawOffAxis: Math.abs(forward.x),
            fovDegrees: camera.camera!.fov,
            distanceMetres: camera.getPosition().distance(benny.getPosition()),
            cityVertices: buildings.render!.meshInstances[0]!.mesh!.vertexBuffer!.numVertices,
            kiosks: app.root.find((e) => e.name.startsWith('kiosk-beacon-')).length,
            beams: app.root.find((e) => e.name.startsWith('kiosk-beam-') && (e as Entity).enabled).length,
            freeBeacons: app.root
                .find((e) => e.name.startsWith('kiosk-beacon-'))
                .filter((e) => (e as Entity).render!.meshInstances[0]!.material!.name === 'beacon-free').length
        };
    });
    const where = `seed ${seed}: ${JSON.stringify(view)}`;
    expect(view.cityVertices, where).toBeGreaterThan(1000);
    expect(view.kiosks, where).toBe(8);
    // Every free kiosk sends a light beam up; occupied ones do not
    expect(view.beams, where).toBe(view.freeBeacons);
    expect(view.pitchDegrees, where).toBeCloseTo(CAMERA.pitchDegrees, 3);
    expect(view.yawOffAxis, where).toBeCloseTo(0, 6);
    expect(view.fovDegrees, where).toBe(CAMERA.fovDegrees);
    expect(view.distanceMetres, where).toBeCloseTo(CAMERA.distance.slimMetres, 3);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/smoke-city.png` });
    expect(errors, `seed ${seed}`).toEqual([]);
});

test('shows the debug maps for a fixed seed with ?seed and ?debug', async ({ page }) => {
    const errors = await openGame(page, '?seed=42&debug=1');

    const panel = page.locator('.debug-map');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('seed 42');
    await expect(panel.locator('.debug-map-cell')).toHaveCount(2);

    const sample = await sampleCanvas(page);
    expect(sample.distinctColors).toBeGreaterThanOrEqual(3);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/smoke-debug.png` });
    expect(errors).toEqual([]);
});

/** Benny's position and size, read from his entity through the devtools hook. */
function benny(page: Page) {
    return page.evaluate(() => {
        const app = [...globalThis.__playcanvasApps!.keys()][0]!;
        const entity = app.root.findByName('benny') as Entity;
        const camera = app.root.findByName('camera') as Entity;
        const position = entity.getPosition();
        return {
            x: position.x,
            z: position.z,
            scale: entity.getLocalScale().x,
            cameraDistance: camera.getPosition().distance(position)
        };
    });
}

/**
 * Holds arrow keys until Benny has moved past a goal. WebGL renders in software here, a few frames per second, and slow
 * frames slow the simulation down, so the test waits for the distance rather than for a fixed time.
 */
async function holdUntil(
    page: Page,
    keys: string[],
    goal: { dx?: number; dz?: number },
    from: { x: number; z: number }
) {
    for (const key of keys) {
        await page.keyboard.down(key);
    }
    await page.waitForFunction(
        ({ goal, from }) => {
            const app = [...globalThis.__playcanvasApps!.keys()][0]!;
            const p = (app.root.findByName('benny') as Entity).getPosition();
            const reached = (delta: number | undefined, moved: number) =>
                delta === undefined || (delta > 0 ? moved >= delta : moved <= delta);
            return reached(goal.dx, p.x - from.x) && reached(goal.dz, p.z - from.z);
        },
        { goal, from },
        { timeout: 30_000, polling: 100 }
    );
    for (const key of keys) {
        await page.keyboard.up(key);
    }
}

test('moves Benny with the arrow keys, diagonals included, without scrolling the page', async ({ page }) => {
    const errors = await openGame(page, '?seed=42');
    await sampleCanvas(page);

    const start = await benny(page);
    await holdUntil(page, ['ArrowRight'], { dx: 2 }, start);
    const right = await benny(page);
    expect(Math.abs(right.z - start.z)).toBeLessThan(0.05);

    await holdUntil(page, ['ArrowLeft', 'ArrowDown'], { dx: -1, dz: 1 }, right);
    const diagonal = await benny(page);
    // Eight directions: left and down together move him both ways at once
    expect(right.x - diagonal.x).toBeGreaterThan(1);
    expect(diagonal.z - right.z).toBeGreaterThan(1);

    const scrolled = await page.evaluate(() => window.scrollX + window.scrollY);
    expect(scrolled).toBe(0);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/smoke-moved.png` });
    expect(errors).toEqual([]);
});

test('starts a massive Benny with ?weight=1', async ({ page }) => {
    const errors = await openGame(page, '?seed=42&weight=1&debug=1');
    await sampleCanvas(page);

    const massive = await benny(page);
    const slimDiameter = WEIGHT.diameter.baseMetres;
    expect(massive.scale).toBeCloseTo((slimDiameter + WEIGHT.diameter.gainMetres) / slimDiameter, 3);
    // The camera pulls back to its farthest distance
    expect(massive.cameraDistance).toBeCloseTo(CAMERA.distance.maxWeightMetres, 1);
    await expect(page.locator('.debug-readout')).toContainText('massive');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/smoke-massive.png` });
    expect(errors).toEqual([]);
});

test('fades the buildings between the camera and Benny', async ({ page }) => {
    const errors = await openGame(page, '?seed=42');
    await sampleCanvas(page);
    const fadedNow = () =>
        page.evaluate(() => {
            const app = [...globalThis.__playcanvasApps!.keys()][0]!;
            return (app.root.findByName('city-buildings-faded') as Entity).enabled;
        });
    expect(await fadedNow()).toBe(false);

    // South of the plaza, the buildings beyond the next street stand between the camera (to the south) and Benny
    await page.keyboard.down('ArrowDown');
    await page.waitForFunction(
        () => {
            const app = [...globalThis.__playcanvasApps!.keys()][0]!;
            return (app.root.findByName('city-buildings-faded') as Entity).enabled;
        },
        undefined,
        { timeout: 60_000, polling: 100 }
    );
    await page.keyboard.up('ArrowDown');
    expect(await fadedNow()).toBe(true);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/smoke-faded.png` });
    expect(errors).toEqual([]);
});

test('runs out of underpants after five accidents, and Enter starts again', async ({ page }) => {
    // ?countdown=1 shortens the fuse so five accidents fit in a smoke test: 12.5 s of game time, which software
    // rendering stretches to a minute or more
    test.setTimeout(240_000);
    const errors = await openGame(page, '?seed=42&countdown=1&debug=1');
    const gameOver = page.locator('.game-over');
    await expect(gameOver).toBeVisible({ timeout: 200_000 });
    await expect(gameOver).toContainText('Out of underpants!');
    await expect(page.locator('.debug-readout')).toContainText('underpants 0');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/smoke-game-over.png` });

    await page.keyboard.press('Enter');
    await page.waitForFunction(() => (globalThis.__playcanvasApps?.size ?? 0) > 0);
    await expect(gameOver).toHaveCount(0);
    await expect(page.locator('.debug-readout')).toContainText('underpants 5');
    expect(errors).toEqual([]);
});

test('shows the countdown, five pairs of underpants, the score and the girth in the HUD', async ({ page }) => {
    const errors = await openGame(page, '?seed=42&countdown=2');
    const hud = page.locator('.hud');
    await expect(hud).toBeVisible();
    const seconds = Number(await hud.locator('.hud-seconds').textContent());
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(2);
    await expect(hud.locator('.hud-score')).toHaveText('0');
    await expect(hud.locator('.hud-tier')).toHaveText('slim');
    await expect(hud.locator('.underpants')).toHaveCount(5);
    // Two seconds is below the low warning: the gauge turns red and shakes
    await expect(hud.locator('.hud-gauge')).toHaveClass(/is-low/);

    // The first accident stains one pair
    await expect(hud.locator('.underpants.is-soiled')).toHaveCount(1, { timeout: 60_000 });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/smoke-hud.png` });
    expect(errors).toEqual([]);
});

test('pops up a toilet within reach when time is short (mercy rule)', async ({ page }) => {
    // Five seconds is too little to reach any kiosk: the mercy rule puts a pop-up toilet within reach
    const errors = await openGame(page, '?seed=42&countdown=5');
    await page.waitForFunction(
        () => {
            const app = [...globalThis.__playcanvasApps!.keys()][0]!;
            return app.root.find((e) => /^popup-\d+$/.test(e.name) && (e as Entity).enabled).length > 0;
        },
        undefined,
        { timeout: 60_000, polling: 100 }
    );
    await page.screenshot({ path: `${SCREENSHOT_DIR}/smoke-popup.png` });
    expect(errors).toEqual([]);
});

test('points to the nearest free toilets by path distance, greying the ones Benny is too wide for', async ({
    page
}) => {
    const errors = await openGame(page, '?seed=42');
    const shown = page.locator('.toilet-indicator:not([hidden])');
    await expect(shown.first()).toBeVisible();
    await expect(shown.first()).toHaveClass(/is-nearest/);
    await expect(shown.first()).toContainText(/\d+ m/);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/smoke-indicators.png` });

    // At maximum weight, kiosks on streets are out of reach: they show greyed
    await page.goto('./?seed=42&weight=1');
    await page.waitForFunction(() => (globalThis.__playcanvasApps?.size ?? 0) > 0);
    await expect(page.locator('.toilet-indicator.is-unreachable').first()).toContainText('too wide');
    expect(errors).toEqual([]);
});

test('spawns food around Benny', async ({ page }) => {
    const errors = await openGame(page, '?seed=42');
    await page.waitForFunction(
        () => {
            const app = [...globalThis.__playcanvasApps!.keys()][0]!;
            return app.root.find((e) => /^food-\d+$/.test(e.name) && (e as Entity).enabled).length >= 2;
        },
        undefined,
        { timeout: 80_000, polling: 200 }
    );
    expect(errors).toEqual([]);
});
