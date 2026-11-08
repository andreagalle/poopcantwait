import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/`;

// End-to-end smoke tests against the production preview (`npm run build` first). Chromium only.
export default defineConfig({
    testDir: 'tests/e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: BASE_URL,
        trace: 'retain-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
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
