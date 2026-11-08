import { defineConfig } from 'vitest/config';

// Unit tests for the engine-agnostic rules. Coverage is measured on src/core/, where AGENTS.md asks for at least 85%
// line coverage.
export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            include: ['src/core/**/*.ts'],
            exclude: ['src/**/*.test.ts'],
            reporter: ['text', 'html'],
            thresholds: {
                lines: 85
            }
        }
    }
});
