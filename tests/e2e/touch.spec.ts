import { expect, test } from '@playwright/test';

import { openGame, SCREENSHOT_DIR } from './helpers';

// A phone held upright: touch only, no mouse, no keyboard (design: Controls). Touch controls are a later milestone; for
// now the title screen says the game needs a keyboard.
test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
});

test('tells a phone that the game needs a keyboard, without overflowing the screen', async ({ page }) => {
    const errors = await openGame(page, '?seed=42', false);
    const title = page.locator('.screen-title');
    await expect(title).toBeVisible();
    await expect(title).toHaveClass(/is-touch/);
    await expect(title.locator('.screen-touch')).toBeVisible();
    await expect(title.locator('.screen-touch')).toContainText('needs a keyboard');
    // No keys to press on a phone: the controls and "Press Enter" are not shown
    await expect(title.locator('.screen-start')).toBeHidden();
    await expect(title.locator('.screen-controls')).toBeHidden();
    // The link to the story points out of the game, to the site's /story/
    await expect(title.getByRole('link', { name: 'Read how it was made' })).toHaveAttribute('href', '../story/');
    // The panel fits the screen
    const box = (await title.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/touch-title.png` });
    expect(errors).toEqual([]);
});
