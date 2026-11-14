import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { SCREENSHOT_DIR } from './helpers';

/**
 * The GitHub Pages site around the game: the landing page at the root and the story of the development under
 * /story/. The game itself lives under /gottago/ (the base URL of the other tests), so these use absolute paths.
 */

function collectErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    return errors;
}

test('the landing page leads to the game and to the story', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gotta Go!');
    await expect(page.getByText('Claude Code')).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/site-landing.png` });

    await page.getByRole('link', { name: 'Read the story' }).click();
    await expect(page).toHaveURL(/\/story\/$/);
    await expect(page.locator('#top h1')).toBeVisible();

    await page.goto('/');
    await page.getByRole('link', { name: 'Play now' }).click();
    await expect(page).toHaveURL(/\/gottago\/$/);
    await expect(page.locator('.screen-title')).toBeVisible();
    expect(errors).toEqual([]);
});

test('the story snaps from stage to stage and moves its HUD along', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/story/');

    const stages = page.locator('section.stage');
    expect(await stages.count()).toBeGreaterThanOrEqual(20);
    const ids = await stages.evaluateAll((list) => list.map((stage) => stage.id));
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    // Every {{name}} placeholder was filled from site/stats.json at build time
    expect(await page.content()).not.toMatch(/\{\{\w+\}\}/);

    // The cover keeps the HUD out of the way; one key press moves one stage and brings it in
    await expect(page.locator('body')).toHaveClass(/at-cover/);
    await page.keyboard.press('PageDown');
    await expect(stages.nth(1)).toHaveClass(/is-active/);
    await expect(page.locator('body')).not.toHaveClass(/at-cover/);

    // A link to a stage lands on it, and the HUD shows that moment of the story
    await page.goto('/story/#go');
    await expect(page.locator('#go')).toHaveClass(/is-active/);
    await expect(page.locator('.hud-human-n')).toHaveText('4');
    await expect(page.locator('.hud-t')).toHaveText('T+7:19');
    await expect(page.locator('.seg.done')).toHaveCount(3);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/site-story-go.png` });

    // Every screenshot in the story decodes
    const broken = await page.locator('.shot img').evaluateAll(async (images) => {
        const results = await Promise.allSettled(
            images.map((image) => {
                const img = image as HTMLImageElement;
                img.loading = 'eager';
                return img.decode();
            })
        );
        return results.filter((result) => result.status === 'rejected').length;
    });
    expect(broken).toBe(0);
    expect(errors).toEqual([]);
});

/** The side stories: one per topic of the art pass, each linked from a stage of the main story. */
const SIDE_STORIES = [
    { stage: 'benny-look', link: /Side story: Benny's look/, path: 'benny', title: "Benny's look" },
    { stage: 'food-look', link: /Side story: The food set/, path: 'food', title: 'The food set' },
    { stage: 'felt-street', link: /Side story: Traffic and toilets/, path: 'street', title: 'Traffic and toilets' }
];

for (const side of SIDE_STORIES) {
    test(`#${side.stage} opens its side story, which shows every sketch and leads back`, async ({ page }) => {
        const errors = collectErrors(page);
        await page.goto(`/story/#${side.stage}`);
        await expect(page.locator(`#${side.stage}`)).toHaveClass(/is-active/);
        await page.locator(`#${side.stage}`).getByRole('link', { name: side.link }).click();
        await expect(page).toHaveURL(new RegExp(`/story/${side.path}/$`));
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(side.title);

        // Every round shows its sketches, and every one of them decodes
        const sketches = page.locator('.round .sketch img');
        expect(await sketches.count()).toBeGreaterThanOrEqual(4);
        const broken = await sketches.evaluateAll(async (images) => {
            const results = await Promise.allSettled(
                images.map((image) => {
                    const img = image as HTMLImageElement;
                    img.loading = 'eager';
                    return img.decode();
                })
            );
            return results.filter((result) => result.status === 'rejected').length;
        });
        expect(broken).toBe(0);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/site-side-${side.path}.png`, fullPage: true });

        await page.getByRole('link', { name: '← Back to the story' }).click();
        await expect(page).toHaveURL(new RegExp(`/story/#${side.stage}$`));
        await expect(page.locator(`#${side.stage}`)).toHaveClass(/is-active/);
        expect(errors).toEqual([]);
    });
}

test('the landing page and the story fit a phone screen', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 375, height: 740 });
    for (const path of ['/', '/story/benny/', '/story/food/', '/story/street/', '/story/', '/story/#m3-toilets']) {
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
    await expect(page.locator('#m3-toilets')).toHaveClass(/is-active/);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/site-story-phone.png` });
    expect(errors).toEqual([]);
});
