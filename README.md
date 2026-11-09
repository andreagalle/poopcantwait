# Gotta Go!

A 3D arcade game for the browser: guide Benny, a plush toy man in a hurry, through the city to a free toilet before
it is too late. Eat junk food for points, dodge vegetables, flatten traffic once you are big enough.

Built with the [PlayCanvas Engine](https://playcanvas.com/) (TypeScript and Vite) and published on GitHub Pages.

**Play:** <https://andreagalle.github.io/poopcantwait/> (available after the first release)

## How to play

Benny has to go, and the countdown in the top left says how long he can hold it. Run him to a free toilet: kiosks
with a green beacon, or the portable cabins that pop up as he grows. The signs at the screen edges point to the nearest
free ones by walking distance. Junk food scores points (eat in quick succession for a combo) but makes him fatter,
slower and wider: the bar in the bottom left shows when alleys and streets stop fitting him, and when he is heavy
enough to crumple cars and buses instead of bouncing off them. Vegetables cost seconds. When the countdown runs out,
a pair of underpants is gone; the run ends after five.

## Controls

Arrow keys to run (two at once for diagonals). Enter or Space to start, Escape or P to pause (leaving the tab pauses
too), M to mute. Sound starts with the first key press.

## Development

Open the repository in a GitHub Codespace: the dev container installs Node.js, the GitHub CLI and Claude Code.
Elsewhere, you need Node.js 22.23.2 or later.

```sh
npm ci
npm run dev       # dev server on port 5173
npm run check     # types, lint, format, unit tests
npm run build     # production build into dist/
npm run start     # serve dist/ on port 4173
npm run test:e2e  # end-to-end smoke tests (first run: npx playwright install chromium)
```

In VS Code, **Terminal > Run Task** offers ready-made tasks, including **Test dev: production preview** to try the
current `dev` branch exactly as GitHub Pages will serve it.

The dev server loads the [PlayCanvas Inspector](https://github.com/playcanvas/inspector), a debug panel for the
hierarchy, assets, materials, textures and frame graph: press the backquote key (<kbd>&#96;</kbd>) to show or hide it,
<kbd>F9</kbd> to pause and <kbd>F10</kbd> to step a frame. Production builds leave it out.

The build uses relative paths, so `dist/` runs from any folder, including the GitHub Pages project subpath.

URL parameters for testing (they change nothing when absent):

| Parameter        | Effect                                                            |
| ---------------- | ----------------------------------------------------------------- |
| `?seed=<n>`      | Fixes the run: the same city, the same events.                    |
| `?debug=1`       | Shows the debug panel: zone and girth maps, Benny's live numbers. |
| `?weight=<0..1>` | Starts Benny at that weight, to try the girth tiers.              |
| `?countdown=<s>` | Sets the urgency countdown to that many seconds (1 to 600).       |

## Documentation

- [Game design](docs/GAME_DESIGN.md)
- [Contributing](CONTRIBUTING.md): branches, commits, pull requests, releases
- [Asset pipeline](docs/ASSET_PIPELINE.md)
- [Agent instructions](AGENTS.md)
- [Roadmap](docs/ROADMAP.md): milestones and their status
- [Changelog](CHANGELOG.md)

## License

To be decided by the maintainer. Third-party asset credits are in [CREDITS.md](CREDITS.md).
