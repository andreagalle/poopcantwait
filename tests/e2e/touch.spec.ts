import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Entity } from 'playcanvas';

import { openGame, SCREENSHOT_DIR } from './helpers';

// A phone held upright: touch only, no mouse, no keyboard (design: Controls). A finger steers Benny like a floating
// stick, taps go through the screens, and two buttons pause and mute.
test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
});

/** Whether two elements' boxes on the screen overlap. */
async function overlap(page: Page, a: string, b: string): Promise<boolean> {
    const [boxA, boxB] = [(await page.locator(a).boundingBox())!, (await page.locator(b).boundingBox())!];
    return (
        boxA.x < boxB.x + boxB.width &&
        boxB.x < boxA.x + boxA.width &&
        boxA.y < boxB.y + boxB.height &&
        boxB.y < boxA.y + boxA.height
    );
}

/** Benny's position on the ground, read through the devtools hook. */
function benny(page: Page) {
    return page.evaluate(() => {
        const app = [...globalThis.__playcanvasApps!.keys()][0]!;
        const position = (app.root.findByName('benny') as Entity).getPosition();
        return { x: position.x, z: position.z };
    });
}

test('a phone plays with a finger: tap to start, drag to run, buttons to pause and mute', async ({ page }) => {
    // A whole run in software rendering, a few frames per second: it takes about a minute on its own, more under load
    test.slow();
    const errors = await openGame(page, '?seed=42', false);
    const title = page.locator('.screen-title');
    await expect(title).toBeVisible();
    await expect(title).toHaveClass(/is-touch/);
    await expect(title).toContainText('Drag anywhere to run');
    await expect(title.locator('.screen-start')).toHaveText('Tap to start');
    // Held upright, the title suggests turning the phone
    await expect(title.locator('.screen-rotate')).toBeVisible();
    // The panel fits the screen
    const box = (await title.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/touch-title.png` });

    // The mute button mutes without starting the run
    const mute = page.getByRole('button', { name: 'Mute' });
    await mute.tap();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await expect(title).toBeVisible();
    await mute.tap();
    await expect(mute).toHaveAttribute('aria-pressed', 'false');

    // A tap anywhere starts
    await page.touchscreen.tap(195, 600);
    await expect(title).toBeHidden();

    // A finger dragged to the right runs Benny right, and the stick shows under it until it lifts
    const cdp = await page.context().newCDPSession(page);
    const start = await benny(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 500 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 500 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 230, y: 505 }] });
    await expect(page.locator('.touch-stick')).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/touch-steer.png` });
    await page.waitForFunction(
        (from) => {
            const app = [...globalThis.__playcanvasApps!.keys()][0]!;
            return (app.root.findByName('benny') as Entity).getPosition().x - from.x > 2;
        },
        start,
        { timeout: 30_000, polling: 100 }
    );
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.touch-stick')).toBeHidden();
    const moved = await benny(page);
    // A drag slightly off the horizontal still snaps to straight right, like the arrow key: no drift down the screen
    expect(Math.abs(moved.z - start.z)).toBeLessThan(0.05);

    // The compact HUD fits a phone held upright: no panel covers another, the buttons stay clear of the weight bar
    for (const [a, b] of [
        ['.hud-gauge', '.hud-underpants'],
        ['.hud-gauge', '.hud-score-box'],
        ['.hud-score-box', '.hud-underpants'],
        ['.touch-buttons', '.hud-weight']
    ]) {
        expect(await overlap(page, a, b), `${a} and ${b}`).toBe(false);
    }

    // The pause button pauses, and a tap goes on
    await page.getByRole('button', { name: 'Pause' }).tap();
    const paused = page.locator('.screen-pause');
    await expect(paused).toBeVisible();
    await expect(paused).toContainText('Tap to go on');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeHidden();
    await page.touchscreen.tap(195, 600);
    await expect(paused).toBeHidden();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    expect(errors).toEqual([]);
});

test.describe('held sideways', () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test('steers the same, with the buttons clear of the weight bar', async ({ page }) => {
        test.slow();
        const errors = await openGame(page, '?seed=42', false);
        // Already sideways: no hint to turn the phone
        await expect(page.locator('.screen-rotate')).toBeHidden();
        await page.touchscreen.tap(422, 300);
        await expect(page.locator('.screen-title')).toBeHidden();
        const cdp = await page.context().newCDPSession(page);
        const start = await benny(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 250, y: 250 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 250, y: 190 }] });
        await page.waitForFunction(
            (from) => {
                const app = [...globalThis.__playcanvasApps!.keys()][0]!;
                return from.z - (app.root.findByName('benny') as Entity).getPosition().z > 2;
            },
            start,
            { timeout: 30_000, polling: 100 }
        );
        await page.screenshot({ path: `${SCREENSHOT_DIR}/touch-sideways.png` });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        expect(await overlap(page, '.touch-buttons', '.hud-weight')).toBe(false);
        expect(errors).toEqual([]);
    });
});
