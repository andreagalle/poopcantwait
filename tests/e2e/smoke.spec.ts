import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AppBase, Entity } from 'playcanvas';

import { CAMERA } from '../../src/config/tuning';

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
    const errors = await openGame(page);

    await expect(page).toHaveTitle('Gotta Go!');
    await expect(page.getByText('Gotta Go! (work in progress)')).toBeVisible();
    await expect(page.locator('.debug-map')).toHaveCount(0);

    const sample = await sampleCanvas(page);
    test.info().annotations.push({ type: 'canvas', description: JSON.stringify(sample) });
    expect(sample.distinctColors).toBeGreaterThanOrEqual(3);
    expect(sample.dominantShare).toBeLessThan(0.99);
    expect(sample.drawCalls).toBeLessThan(DRAW_CALL_BUDGET);

    // The city is built, and the camera looks down at Benny from the design angle and distance
    const view = await page.evaluate(() => {
        const app = [...globalThis.__playcanvasApps!.keys()][0]!;
        const camera = app.root.findByName('camera') as Entity;
        const benny = app.root.findByName('benny') as Entity;
        const solids = app.root.findByName('city-solids') as Entity;
        const forward = camera.forward;
        return {
            pitchDegrees: (Math.asin(-forward.y) * 180) / Math.PI,
            yawOffAxis: Math.abs(forward.x),
            fovDegrees: camera.camera!.fov,
            distanceMetres: camera.getPosition().distance(benny.getPosition()),
            cityVertices: solids.render!.meshInstances[0]!.mesh!.vertexBuffer!.numVertices
        };
    });
    expect(view.cityVertices).toBeGreaterThan(1000);
    expect(view.pitchDegrees).toBeCloseTo(CAMERA.pitchDegrees, 3);
    expect(view.yawOffAxis).toBeCloseTo(0, 6);
    expect(view.fovDegrees).toBe(CAMERA.fovDegrees);
    expect(view.distanceMetres).toBeCloseTo(CAMERA.distance.slimMetres, 3);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/smoke-city.png` });
    expect(errors).toEqual([]);
});

test('shows the debug maps for a fixed seed with ?seed and ?debug', async ({ page }) => {
    const errors = await openGame(page, '?seed=42&debug=1');

    const panel = page.locator('.debug-map');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('seed 42');
    await expect(panel.locator('canvas')).toHaveCount(2);

    const sample = await sampleCanvas(page);
    expect(sample.distinctColors).toBeGreaterThanOrEqual(3);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/smoke-debug.png` });
    expect(errors).toEqual([]);
});
