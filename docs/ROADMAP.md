# Roadmap

The development plan for version 0.1.0, from the maintainer's kickoff. `docs/GAME_DESIGN.md` says what to build;
this file says in which order. Each milestone is split into topic branches (at least one per concern) that follow
`/feature`, and the release PR from `dev` into `master` is refreshed after every merge (`/release-pr`). After each
milestone the agent reports in chat: what shipped, the PR links, how to try it (VS Code task, URL parameters), what it
could not verify, and the branches it proposes next.

Gameplay comes first, in greybox; art comes later (M6), so no generation credits are spent on things that may change.

| Milestone                     | Status      |
| ----------------------------- | ----------- |
| M0: scaffold and toolchain    | Done (#3)   |
| M1: the city                  | Not started |
| M2: Benny moves               | Not started |
| M3: the clock and the toilets | Not started |
| M4: food, weight and score    | Not started |
| M5: traffic                   | Not started |
| M6: art pass                  | Not started |
| M7: game feel and flow        | Not started |
| M8: hardening                 | Not started |

## M0: scaffold and toolchain

The PlayCanvas engine starter (`npm create playcanvas@latest -- -f engine -s spinning-cube`) merged into the
repository; the script contract from `AGENTS.md`; Vitest with V8 coverage and Playwright; the Vite settings for
Codespaces; the ESLint rule that keeps `playcanvas` out of `src/core/`; `src/core/rng.ts` and `src/config/tuning.ts`;
a greybox scene (ground plane, a capsule standing in for Benny, the camera at the design angle, a work-in-progress
overlay), the page title and an original favicon. Branch: `chore/scaffold`.

## M1: the city

`src/core/city/`: the seeded generator that satisfies every generation rule in _The city_ (street classes and widths,
connected avenue network, streets joined at both ends, alleys, landmarks, sidewalk spots for toilet kiosks, the park
and river edge). Build a clearance field (distance from each walkable cell to the nearest obstacle) on a coarse grid
so that "can Benny of diameter `d` stand here?" and path distances at a given girth are cheap. Unit-test the rules as
properties over many seeds: connectivity of the avenue network, a maximum-size Benny can reach every avenue cell,
alleys are never wider than their class, generation is deterministic per seed. Render it in greybox (batched or
instanced boxes, roads coloured by class) and add the `?debug=1` overlay. Suggested branches: `feat/city-generator`,
`feat/city-greybox`.

## M2: Benny moves

Arrow-key input (screen-relative, eight directions, no page scrolling), the fixed-step simulation loop, acceleration
and top speed from weight, kinematic circle collision with sliding against buildings and the city edge, the girth rule
for narrow streets, and the camera rig (follow with damping, look-ahead, pull-back with weight, building fading). Add a
`?weight=<0..1>` URL parameter to test girth tiers. The smoke test presses arrow keys and checks that Benny moved.
Suggested branches: `feat/player-movement`, `feat/camera-rig`.

## M3: the clock and the toilets

Urgency countdown, accidents and the five underpants, kiosk occupancy cycles, using and waiting at toilets, pop-up
toilets with the weight-scaled interval and the mercy rule, off-screen indicators by path distance at the current
girth, game states (playing, accident, game over) and a first HUD. Suggested branches: `feat/urgency-countdown`,
`feat/toilet-kiosks`, `feat/popup-toilets`, `feat/toilet-indicators`, `feat/hud-basics`.

## M4: food, weight and score

Food spawner (rates, caps, lifetimes, the vegetable share growing over time), junk food and vegetable effects, the
weight model driving speed, girth, visual size and camera distance, combos, relief and clutch bonus, high scores in
`localStorage`. Suggested branches: `feat/food-spawner`, `feat/weight-and-girth`, `feat/scoring`.

## M5: traffic

Lanes on streets, avenues and boulevards, vehicles picking turns at intersections, buses on wide roads only, density
growth, horns, and the collision outcomes (knock-back, stun and shock below the threshold, crumpling above it, belly
bounce, bonuses). At the end of M5 the whole loop must be playable in greybox. Suggested branches:
`feat/traffic-lanes`, `feat/vehicle-collisions`.

## M6: art pass

First `chore/asset-pipeline`: `scripts/assets/optimize.mjs` with the presets from `docs/ASSET_PIPELINE.md` (glTF
Transform, sharp, meshoptimizer as dev dependencies), `scripts/assets/gen-image.mjs` for OpenRouter, the typed
registry in `src/assets/registry.ts`. Then, with `/asset` and the maintainer's approval for every paid call: Benny's
concept sheet (shown to the maintainer, then wait), Benny in 3D with rig and animations, the food and vegetable set,
vehicles, toilets, street props, facade and road textures. Replace greybox pieces as each asset lands. Needs the
`MESHY_API_KEY` and `OPENROUTER_API_KEY` Codespaces secrets. Suggested branches: `chore/asset-pipeline`,
`assets/benny`, `assets/food-set`, `assets/vehicles`, `assets/toilets`, `assets/city-dressing`.

## M7: game feel and flow

Title, pause and game-over screens, CC0 audio with mute (the maintainer puts the sound packs in `art/raw/audio/` when
asked), effects (eating pops, stink cloud, crumple smoke, camera shake, squash and stretch), HUD polish and the weight
bar markers. Suggested branches: `feat/screens`, `feat/audio`, `feat/juice`, `feat/hud-polish`.

## M8: hardening

Performance against the budgets (draw calls, frame time, download size), an end-to-end test that plays a seeded run to
a relief and to a game over, documentation brought up to date. Then ask the maintainer whether to cut `0.1.0` with
`/release-pr cut 0.1.0`. Suggested branches: `perf/draw-calls`, `perf/asset-size`, `test/e2e-full-run`,
`docs/final-pass`.
