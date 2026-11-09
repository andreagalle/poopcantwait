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
    await page.waitForFunction(() => (globalThis.__playcanvasApps?.size ?? 0) > 0);
    if (start) {
        await page.keyboard.press('Enter');
        await expect(page.locator('.screen-title')).toBeHidden();
    }
    return errors;
}
