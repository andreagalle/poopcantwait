import typescriptConfig from '@playcanvas/eslint-config/typescript';

export default [
    {
        ignores: [
            '.claude',
            '.agents',
            'public/ammo',
            'coverage',
            'tmp',
            'art/raw',
            'playwright-report',
            'test-results'
        ]
    },
    ...typescriptConfig,
    {
        // Logging belongs to debug aids and scripts only (CONTRIBUTING.md, Code standards)
        files: ['src/**/*.ts'],
        ignores: ['src/debug/**'],
        rules: {
            'no-console': 'error'
        }
    },
    {
        // The game rules stay engine-agnostic, deterministic and unit-testable (AGENTS.md, Architecture)
        files: ['src/core/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [{ name: 'playcanvas', message: 'src/core/ must not depend on the engine.' }],
                    patterns: [{ group: ['playcanvas/*'], message: 'src/core/ must not depend on the engine.' }]
                }
            ]
        }
    }
];
