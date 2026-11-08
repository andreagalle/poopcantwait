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
- Benny runs with the arrow keys in eight directions (screen-relative, the page never scrolls): acceleration, top
  speed and girth from his weight, sliding collisions against the city, a fixed-step simulation with interpolated
  rendering. `?weight=<0..1>` starts him at a given weight; `?debug=1` shows his live numbers and position.
- Camera rig: it follows Benny with damping and a small look-ahead, pulls back from 18 m to 40 m as he grows, and
  fades the buildings that stand between it and him.
- Urgency countdown (40 s) with accidents: at 0 Benny freezes and shivers, a pair of underpants is soiled and the
  countdown starts again; after the fifth the run is over (Enter starts a new one). `?countdown=<s>` shortens the
  fuse for testing.
- First HUD: the urgency gauge (tummy icon, seconds, a bar from green to red that shakes in the last ten seconds),
  the score, five pairs of boxer shorts that stain one by one, and the weight bar with the girth tier.
- Toilet kiosks cycle between free (green beacon, light beam) and occupied (red beacon, rattling door), longer
  occupied as the run goes on. Half a second at the door of a free one gives relief ("Phew!") and a fresh countdown;
  at an occupied one a ring shows how long until it frees up.
