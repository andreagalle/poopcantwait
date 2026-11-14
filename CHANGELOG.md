# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Felt traffic: four little cars that take turns (green, orange, a blue van, yellow) and a red bus, from the vehicle
  sketches the maintainer kept, 3,999 to 5,917 triangles each, stretched to their size in the game. A wreck stays
  squashed and grey.
- Felt toilets: every kiosk and pop-up is the same teal portable cabin the maintainer picked (1,596 triangles). No roof
  beacon: a round sign on the door shows free or occupied, green or red, and an occupied cabin rattles.

### Changed

- Benny walks briskly instead of running: his run swung his arms wide and his feet slid over the ground. One walk clip
  plays at a cadence that follows his speed (his feet match the ground up to 3.6 m/s), and his model drops the run and
  the waddle clips (1.18 MB instead of 1.31 MB).

## [0.4.0] - 2026-11-14

### Added

- Benny in felt: his model from the maintainer's sketches (Meshy image to 3D, rigged), 18,708 triangles and 1.3 MB with
  five clips: idle, walk, run, a clenched waddle on a low countdown and a fall when knocked over. The clips play at a
  speed that follows his, under the procedural squash and stretch; the capsule stays as the fallback.
  `npm run assets:merge-clips` puts clips from other GLBs of the same rig onto one model.
- The whole food set in felt: the twelve other junk foods and vegetables join the burger, 870 to 1,500 triangles and
  about 90 kB each (1.2 MB for the thirteen). Four of them are laid down in the game, since they came out standing the
  way their image showed them.
- The first felt model in the game, the burger: made from the maintainer's food sketches with Meshy (image to 3D),
  1,499 triangles and 94 kB. The other twelve items keep their greybox shapes until theirs land. The game now loads GLB
  models from the asset registry (`src/assets/load.ts`); a model that fails to load leaves its greybox stand-in.

### Changed

- No more glow ring under the food: it read as a halo, the maintainer found. Each item hovers over its own shadow.
- Releases publish themselves: on every merge into `master`, `.github/workflows/release.yml` creates the tag and the
  GitHub Release from `package.json` and `CHANGELOG.md`, then records the release in `dev`'s history. The agent checks
  its work and does by hand only what it could not.
- The side stories show the maintainer's picks: Benny's sketch 1 and the felt food (sheet 2), with the other sketches
  set aside; a stage of the story quotes the pick.
- Release PRs are squash-merged into `master`, the maintainer's choice; right after publishing a release, the agent
  records it in `dev`'s history with a `chore/sync-master-into-dev-v<x.y.z>` merge (`CONTRIBUTING.md`, _Releases_).

- Dependencies: the PlayCanvas engine 2.24.0, the Inspector 0.5, Vite 8.3.7 and ESLint 10; `actions/checkout` and
  `actions/setup-node` 7 in the workflows.

### Fixed

- The end-to-end tests wait for the title screen before pressing a key: since the game loads its models first, a key
  pressed as soon as the app existed could be lost on a slow runner. The scripted run to a kiosk heads back to its
  planned way when a car knocks Benny off it, instead of walking into the buildings.
- The story's v0.3.0 stage showed the time of the morning's merges (08:20) instead of the cut's (18:12), and the counts
  of that moment.

## [0.3.0] - 2026-11-13

### Added

- Touch controls (M9): on a phone or a tablet a finger anywhere steers Benny like a floating stick, in the same eight
  directions as the arrow keys; a tap starts, goes on from pause and plays again; round buttons mute and pause. The
  title, pause and game-over screens speak of taps and drags there, instead of saying the game needs a keyboard.
- A compact HUD for narrow screens such as a phone held upright: the panels shrink and the score moves to a second row,
  so nothing overlaps at 390 px; the title suggests turning the phone sideways while it is upright.
- The story's second side story, _The food set_ (`/story/food/`): the first round of food sketches, all thirteen items
  on one sheet in two materials (stitched felt like Benny, or glossy vinyl), waiting for the maintainer's pick.

### Changed

- Smoother frames on slower devices: the twice-a-second search for the walking distances from Benny is spread over
  several simulation steps (4,000 cells a step, 10 steps for a slim Benny) instead of running in one, which cut the
  slowest step from about 5.5 ms to about 2 ms on the Codespace. The distances change only when a search is complete,
  and a seeded run still plays the same everywhere.
- The story's milestone bar includes M9, touch controls.

## [0.2.0] - 2026-11-12

### Added

- `npm run assets:image` sends only the options given (`--quality`, `--background transparent`, `--resolution`,
  `--format`) and takes up to four `--reference` images to keep a character consistent across views.
- On a phone or a tablet without a mouse, the title screen says the game needs a keyboard for now and links to the
  story, instead of listing keys there are none of; touch controls are planned as milestone M9.
- The story's first side story, _Benny's look_ (`/story/benny/`): every round of sketches for the hero, the ones
  set aside and the one kept, with the prompt, linked from a stage of the main story. The default image model is now
  `openai/gpt-image-2` (`gpt-image-1` is no longer served).

### Changed

- Every merge into `master` is now an official release: the release PR is versioned before the merge, and the tag and
  the GitHub Release are published right after it (`CONTRIBUTING.md`, _Releases_; `/release-pr publish`).

### Fixed

- A link to a stage of the story (`/story/#<stage>`) jumps straight to that stage, on a fresh load or from the story
  itself; it used to land on the cover, or scroll smoothly through every stage before it.
- `npm run story:stats` no longer counts the summary Claude Code writes when a long conversation continues, or
  messages from other agent sessions, as messages from the maintainer: the story counted 33 messages instead of 32.

## [0.1.0] - 2026-11-11

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
- Pop-up toilets: teal cabins that pop out of the ground where Benny can go, more often as he grows (every 25 s
  slim, 6 s at maximum weight), for 20 s each; and the mercy rule, which puts one within reach at once when no free
  toilet is, once per countdown.
- Toilet indicators: the three nearest free toilets by path distance at Benny's girth, with the distance in metres and
  the nearest highlighted, as labels in view or arrows at the screen edges; the ones he is too wide for show grey.
- Weight gain: Benny grows wider and slower and the camera pulls back as his weight rises; if he grows too wide for an
  alley or a street, he is squeezed out along it to the nearest spot where he fits.
- Food: junk food and vegetables appear around Benny (one every 1.2 s, at most 25, for 30 s each, vegetables rising
  from 20% to 40% of them over eight minutes), hovering and spinning over a gold or green glow. Junk food makes him
  heavier; vegetables take seconds off the countdown.
- Scoring: junk food points times a combo that grows by 0.5 for every item eaten within 3 s (up to ×3), relief worth
  250 plus 20 per second left on the countdown, "+points" rising where they were scored, and the best five scores
  kept in the browser and shown at game over.
- Traffic: 12 cars and 3 buses drive the streets, avenues and boulevards (buses only the wide ones) in right-hand
  lanes, picking a way at every intersection; their number grows 15% a minute up to three times, and they honk at Benny
  when he stands in their way.
- Collisions with traffic: below a vehicle's crumple threshold (cars 0.5, buses 0.85) Benny is knocked back along its
  way, stunned and loses 3 s, all less the fatter he is; at or above it the vehicle crumples into a wreck for 3 s, he
  belly-bounces and scores 300 for a car or 800 for a bus.
- Asset pipeline: `npm run assets:optimize` (glTF Transform, meshoptimizer and sharp: triangle budgets per preset,
  WebP textures, metadata stripped), `npm run assets:image` (OpenRouter images, refuses to spend without `--yes`,
  never prints the key) and the typed asset registry.
- Screens: a title screen with the controls and the best score (Enter or Space starts), pause with Escape or P (and
  automatically when the page loses focus), a remembered mute toggle on M, and Enter to play again after a game over.
- Sound, synthesized in code with Web Audio (no audio files): chomp, "ew", a tummy rumble that quickens on a low
  countdown, flush, crunch, horn, a bonk when knocked over, the accident sting, and an original music loop that speeds
  up when time is short. It starts with the first key press and respects mute.
- Game feel: Benny hops, waddles, breathes, jiggles nervously on a low countdown and stretches on each bite (squash
  and stretch); the camera shakes on hits, crumples and accidents (not with reduced motion); puffs of crumbs, leaves,
  smoke, dust and a stink cloud show what happened.
- HUD polish: the weight bar marks where alleys and streets stop fitting and where cars and buses start crumpling, and
  the score, combo, underpants and tier animate when they change.
- An end-to-end test that plays a seeded run to a kiosk: it plans the way with the game's own navigation grid, steers
  Benny there with the arrow keys and checks the relief.
- The GitHub Pages site: a landing page at the root with the idea of the game and of its agentic development, the
  game under `/gottago/`, and under `/story/` the story of the development from the kickoff prompt on, as full-screen
  stages that snap one at a time under a HUD (time since the kickoff, merged PRs, the maintainer's messages against
  the agent's actions, milestones), with screenshots from each milestone.

### Changed

- Faster path distances: the twice-a-second search for the walking distances from Benny no longer allocates per cell
  or per call, which takes about 40% off the periodic hitch it caused (from about 11 ms to 7 ms for a slim Benny, on
  the Codespace).

### Fixed

- The end-to-end audio test no longer fails on slow CI runners: it gives the music up to 20 s to start, since software
  rendering blocks the main thread for several seconds at the start of a run.
