import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * The GitHub Pages site around the game: the landing page (`/`) and the story of the development (`/story/`). The
 * game has its own config (`vite.config.ts`) and builds into `dist/gottago/`; this one builds into `dist/` first,
 * which is why `npm run build` runs it before the game.
 */
const root = fileURLToPath(new URL('.', import.meta.url));

// Codespaces forwards ports through https://<codespace>-<port>.app.github.dev (same settings as the game's config)
const forwardedHosts = ['.app.github.dev'];
const inCodespace = Boolean(process.env.CODESPACES);

/** The running totals both pages show, kept in one file: `{{name}}` in the HTML is replaced by its value. */
const stats: Record<string, string | number> = JSON.parse(readFileSync(`${root}stats.json`, 'utf8'));

export default defineConfig({
    root,
    // Relative URLs, so the site works under the GitHub Pages project subpath
    base: './',
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: `${root}index.html`,
                story: `${root}story/index.html`
            }
        }
    },
    server: {
        port: 5174,
        allowedHosts: forwardedHosts,
        ...(inCodespace ? { hmr: { clientPort: 443 } } : {})
    },
    preview: {
        allowedHosts: forwardedHosts
    },
    plugins: [
        {
            name: 'story-stats',
            transformIndexHtml: {
                order: 'pre',
                handler: (html) =>
                    html.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
                        if (!(name in stats)) {
                            throw new Error(`site/stats.json has no "${name}"`);
                        }
                        return String(stats[name]);
                    })
            }
        }
    ]
});
