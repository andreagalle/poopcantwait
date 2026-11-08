# Gotta Go!

A 3D arcade game for the browser: guide Benny, a plush toy man in a hurry, through the city to a free toilet before
it is too late. Eat junk food for points, dodge vegetables, flatten traffic once you are big enough.

Built with the [PlayCanvas Engine](https://playcanvas.com/) (TypeScript and Vite) and published on GitHub Pages.

**Play:** <https://andreagalle.github.io/poopcantwait/> (available after the first release)

## Controls

Arrow keys to run. Enter or Space to start, Escape or P to pause, M to mute.

## Development

Open the repository in a GitHub Codespace: the dev container installs Node.js, the GitHub CLI and Claude Code.

```sh
npm ci
npm run dev       # dev server on port 5173
npm run check     # types, lint, format, unit tests
npm run build     # production build into dist/
npm run start     # serve dist/ on port 4173
```

In VS Code, **Terminal > Run Task** offers ready-made tasks, including **Test dev: production preview** to try the
current `dev` branch exactly as GitHub Pages will serve it.

## Documentation

- [Game design](docs/GAME_DESIGN.md)
- [Contributing](CONTRIBUTING.md): branches, commits, pull requests, releases
- [Asset pipeline](docs/ASSET_PIPELINE.md)
- [Agent instructions](AGENTS.md)
- [Changelog](CHANGELOG.md)

## License

To be decided by the maintainer. Third-party asset credits are in [CREDITS.md](CREDITS.md).
