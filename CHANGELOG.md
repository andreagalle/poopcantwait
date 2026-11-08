# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository bootstrap: dev container, agent guardrails, contribution rules, CI and GitHub Pages deployment.
- Project scaffold (PlayCanvas Engine, TypeScript, Vite) with type checking, linting, formatting, unit tests with
  coverage and an end-to-end smoke test; a seeded random generator, the initial tuning values from the game design,
  and a greybox scene: ground, a capsule standing in for Benny, the camera at the design angle and a work-in-progress
  banner.
- The development roadmap (`docs/ROADMAP.md`), milestones M0 to M8.
- Seeded city generator: perimeter ring, avenues and boulevards, street spans, alleys, building lots, the central
  plaza with its fountain, the park, the clock tower, eight kiosk spots and the park and river edge; a navigation grid
  with an exact clearance field and girth-aware path distances.
- The city in greybox, two draw calls for the whole of it: roads coloured by class, pastel buildings, the plaza and
  fountain, the park, the clock tower, kiosks, and the river and parkland around. `?seed=<n>` fixes the city and
  `?debug=1` shows maps of the zones and of where each Benny size fits.
