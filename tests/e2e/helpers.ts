import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AppBase } from 'playcanvas';

declare global {
    // Filled by the devtools hook of the inspect-runtime skill: every live PlayCanvas app (engine 2.23+)
    var __playcanvasApps: Map<AppBase, unknown> | undefined;
    // Filled by the audio probe of the audio test: the audio contexts the page made and the sound sources it started
    var __audioProbe: { contexts: AudioContext[]; sources: number } | undefined;
}

/** Shared by the end-to-end tests: the devtools hook, where screenshots go, and opening the game. */

const DEVTOOLS_HOOK = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../.claude/skills/inspect-runtime/scripts/devtools-hook.js'
);

export const SCREENSHOT_DIR = 'tmp/screenshots';

/**
 * Waits until the game is ready to play: the app exists and its models have loaded, which is when the title screen and
 * the menu keys appear (main.ts creates them right after the models). A key pressed before that would be lost.
 * Software rendering on a slow runner can take a while to load the models, hence the long timeout.
 */
export async function waitForGame(page: Page): Promise<void> {
    await page.waitForFunction(() => (globalThis.__playcanvasApps?.size ?? 0) > 0, undefined, { timeout: 60_000 });
    await expect(page.locator('.screen-title')).toBeVisible({ timeout: 60_000 });
}

/**
 * Opens the game, collects console errors and uncaught exceptions while the test runs, and starts the run from the
 * title screen unless `start` is false.
 */
export async function openGame(page: Page, query = '', start = true): Promise<string[]> {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript({ path: DEVTOOLS_HOOK });
    await page.goto(`./${query}`);
    await waitForGame(page);
    if (start) {
        await page.keyboard.press('Enter');
        await expect(page.locator('.screen-title')).toBeHidden();
    }
    return errors;
}
