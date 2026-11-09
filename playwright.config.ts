import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/`;

// End-to-end smoke tests against the production preview (`npm run build` first), which serves dist/ as GitHub Pages
// will: the landing page at the root, the story under /story/ and the game under /gottago/. Tests open the game with
// relative URLs (`./?seed=42`), so they resolve under /gottago/; the site tests use absolute paths. Chromium only.
// WebGL runs in software (SwiftShader), so every test is bound by rendering speed: one worker at a time, a generous
// timeout, and a smaller viewport than a desktop window.
export default defineConfig({
    testDir: 'tests/e2e',
    workers: 1,
    timeout: 90_000,
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: `${BASE_URL}gottago/`,
        trace: 'retain-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 960, height: 540 },
                // No GPU in a Codespace or on CI runners: render WebGL in software. Headless Chromium falls back to
                // SwiftShader on its own today, but that fallback is deprecated and logs driver warnings, so ask for
                // it explicitly
                launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
            }
        }
    ],
    webServer: {
        command: `npm run start -- --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000
    }
});
