import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
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

test('loads without console errors and renders the greybox scene', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.addInitScript({ path: DEVTOOLS_HOOK });
    await page.goto('./');

    await expect(page).toHaveTitle('Gotta Go!');
    await expect(page.getByText('Gotta Go! (work in progress)')).toBeVisible();

    await page.waitForFunction(() => (globalThis.__playcanvasApps?.size ?? 0) > 0);

    // Copy the canvas right after a rendered frame, before the browser clears the WebGL drawing buffer, and measure
    // how varied its colours are. A blank canvas has a single colour.
    const sample = await page.evaluate(
        () =>
            new Promise<{ deviceType: string; distinctColors: number; dominantShare: number }>((resolve) => {
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
                        deviceType: app.graphicsDevice.deviceType,
                        distinctColors: counts.size,
                        dominantShare: Math.max(...counts.values()) / (size * size)
                    });
                };
                app.on('frameend', onFrameEnd);
            })
    );
    test.info().annotations.push({ type: 'canvas', description: JSON.stringify(sample) });

    expect(sample.distinctColors).toBeGreaterThanOrEqual(3);
    expect(sample.dominantShare).toBeLessThan(0.99);

    // The camera looks down at Benny from the design angle and distance
    const view = await page.evaluate(() => {
        const app = [...globalThis.__playcanvasApps!.keys()][0]!;
        const camera = app.root.findByName('camera') as Entity;
        const benny = app.root.findByName('benny') as Entity;
        const forward = camera.forward;
        return {
            pitchDegrees: (Math.asin(-forward.y) * 180) / Math.PI,
            yawOffAxis: Math.abs(forward.x),
            fovDegrees: camera.camera!.fov,
            distanceMetres: camera.getPosition().distance(benny.getPosition())
        };
    });
    expect(view.pitchDegrees).toBeCloseTo(CAMERA.pitchDegrees, 3);
    expect(view.yawOffAxis).toBeCloseTo(0, 6);
    expect(view.fovDegrees).toBe(CAMERA.fovDegrees);
    expect(view.distanceMetres).toBeCloseTo(CAMERA.distance.slimMetres, 3);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/smoke-greybox.png` });
    expect(errors).toEqual([]);
});
