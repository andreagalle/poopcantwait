import { defineConfig } from 'vite';

// Codespaces forwards ports through https://<codespace>-<port>.app.github.dev, so Vite must accept that host, and the
// HMR client must connect back through the forwarded HTTPS port rather than the local one.
const forwardedHosts = ['.app.github.dev'];
const inCodespace = Boolean(process.env.CODESPACES);

// https://vite.dev/config/
export default defineConfig({
    // Relative URLs, so the build runs wherever it's served from: a domain root or a subpath such as GitHub Pages
    base: './',
    build: {
        // A PlayCanvas build is 1-2.5 MB minified (300-600 kB gzipped), nearly all of it engine code the
        // first frame needs, so warn only for chunks well past that rather than at Vite's 500 kB default
        chunkSizeWarningLimit: 3000
    },
    server: {
        allowedHosts: forwardedHosts,
        ...(inCodespace ? { hmr: { clientPort: 443 } } : {})
    },
    preview: {
        allowedHosts: forwardedHosts
    },
    plugins: [
        {
            // Dev only: install the PlayCanvas Inspector before the app starts (press ` to toggle)
            name: 'playcanvas-inspector',
            apply: 'serve',
            config: () => ({ optimizeDeps: { include: ['@playcanvas/inspector'] } }),
            transformIndexHtml: () => [
                {
                    tag: 'script',
                    attrs: { type: 'module', src: '/src/debug/inspector.ts' },
                    injectTo: 'head-prepend'
                }
            ]
        }
    ]
});
