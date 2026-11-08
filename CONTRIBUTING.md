# Contributing

These rules apply to everyone who changes this repository, human or AI agent. Everything that lands in the repository
is written in English.

## Branch model

| Branch         | Purpose                                                       | Who writes to it                                   |
| -------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| `master`       | Production. Every push deploys the game to GitHub Pages.      | Only the maintainer, by merging the release PR.    |
| `dev`          | Integration. Always builds and passes CI.                     | Only through pull requests from topic branches.    |
| topic branches | One change each: a feature, a fix, a chore, an asset set.     | Their author. Short-lived, deleted after merge.    |

Nobody commits or pushes to `master` or `dev` directly. Changes flow one way:

```text
topic branch --(PR, squash merge)--> dev --(release PR, merge commit, maintainer only)--> master --> GitHub Pages
```

## Topic branch names

Format: `<type>/<short-description>`, optionally with an issue number: `<type>/<issue>-<short-description>`.

- Lowercase ASCII, words separated by hyphens, no spaces, at most 50 characters after the slash.
- Describe the outcome, not the activity: `feat/toilet-occupancy`, not `feat/working-on-toilets`.
- One branch, one purpose. If the description needs "and", split the branch.

| Type        | Use it for                                                           | Example                        |
| ----------- | -------------------------------------------------------------------- | ------------------------------ |
| `feat/`     | New gameplay or user-visible behavior                                | `feat/12-urgency-countdown`    |
| `fix/`      | A bug fix                                                            | `fix/player-stuck-in-alley`    |
| `perf/`     | Performance work with no behavior change                             | `perf/instanced-buildings`     |
| `refactor/` | Code restructuring with no behavior change                           | `refactor/split-traffic-system`|
| `test/`     | Tests only                                                           | `test/toilet-scheduler-edges`  |
| `assets/`   | Generating, replacing or optimizing art and audio                    | `assets/food-set`              |
| `docs/`     | Documentation only                                                   | `docs/tuning-tables`           |
| `chore/`    | Tooling, dependencies, configuration, releases                       | `chore/release-v0.3.0`         |
| `ci/`       | Proposed CI changes (applied by the maintainer, see below)            | `ci/cache-playwright`          |
| `hotfix/`   | Urgent production fix branched from `master` (maintainer only)       | `hotfix/blank-screen-safari`   |

## Working on a change

1. Start from an up-to-date `dev`:

   ```sh
   git fetch origin --prune
   git switch dev
   git pull --ff-only origin dev
   git switch -c feat/short-description
   ```

2. Commit in small, focused steps (see *Commit messages*). Keep the branch building at every commit.
3. Before opening the PR, bring the branch up to date by rebasing, never by merging `dev` into it:

   ```sh
   git fetch origin
   git rebase origin/dev
   git push --force-with-lease   # only on your own topic branch, only after a rebase
   ```

4. Open a pull request **into `dev`** with `--base dev` and fill in the template.
5. When every check is green, **squash-merge** it and delete the branch. The squash commit title is the PR title, so
   the PR title must itself be a valid Conventional Commit.

Plain `--force` pushes are never allowed. `--force-with-lease` is allowed only on your own topic branch.

## Commit messages

Use [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<optional scope>): <imperative summary, lowercase, no period, at most 72 characters>

<optional body: what and why, wrapped at 100 characters>

<optional footer: Refs #12, BREAKING CHANGE: ...>
```

- Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`, `style`, `revert`.
- Scopes follow the code areas: `city`, `player`, `urgency`, `toilets`, `food`, `traffic`, `score`, `camera`, `hud`,
  `audio`, `assets`, `release`.
- Examples: `feat(toilets): free toilets light up green`, `fix(player): keep girth collider inside avenues`.
- Commits written with an AI agent keep the agent's `Co-Authored-By` trailer.

## Pull requests

- Base branch: `dev` for every topic branch. The only PR into `master` is the release PR from `dev`.
- Title: a Conventional Commit summary. Body: the template in `.github/pull_request_template.md`.
- Keep PRs reviewable: aim for under 400 changed lines of code, excluding lockfiles and binary assets.
- Required before merging into `dev`: the CI workflow is green, the branch is up to date with `dev`, and the checklist
  in the template is complete.
- Merge method into `dev`: **Squash and merge**, then delete the branch.

## Releases

1. The release PR from `dev` into `master` stays open and is refreshed after every merge into `dev` (the agent runs
   `/release-pr`).
2. The maintainer tests `dev` in the Codespace with the VS Code task **Test dev: production preview** (the same build
   GitHub Pages will serve, on port 4173), or **Test dev: dev server** for a quick look.
3. For a versioned release, the maintainer asks the agent for `/release-pr cut <x.y.z>`, which versions
   `CHANGELOG.md` and `package.json` through a PR into `dev`.
4. The maintainer merges the release PR with **Create a merge commit**, never squash, so `dev` and `master` keep a
   shared history. The deploy workflow publishes `master` to GitHub Pages.
5. Optionally, the maintainer runs the task **Release: tag master after merging** to tag `v<x.y.z>`.

Versions follow [Semantic Versioning](https://semver.org/) in the `0.x` range until the game is feature-complete.
`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/): every PR into `dev` adds a line under
`## [Unreleased]`.

### Hotfixes

Only the maintainer creates `hotfix/*` branches, from `master`, with a PR into `master`. Right after the merge, open a
PR from `master` into `dev` (or a `chore/sync-master-into-dev` branch) so `dev` gets the fix.

## Code standards

- TypeScript in strict mode, no `any`, no unused locals or parameters. ESLint and Prettier must pass.
- Engine-agnostic rules live in `src/core/` and never import `playcanvas`. Every rule there has unit tests.
- Gameplay numbers live in `src/config/tuning.ts` and nowhere else.
- Comments explain why, not what. Public functions in `src/core/` have a short TSDoc comment.
- No `console.log` in committed code outside `src/debug/` and scripts.

## Assets

Follow `docs/ASSET_PIPELINE.md`. In short: original designs only, raw generations stay out of git (`art/raw/`),
optimized files go in `public/assets/`, and every committed asset has an entry in `art/manifest.json` with its source,
prompt and license.

## Protected files

These files configure CI, the dev container and the agent's guardrails. They change only through the maintainer:
`.github/workflows/`, `.github/dependabot.yml`, `.claude/hooks/`, `.claude/settings.json`, `.mcp.json`,
`.devcontainer/`. To propose a change, open a `ci/` or `chore/` PR that describes the exact diff under
**Maintainer action needed**; the maintainer applies it from their own machine.

## Security

- Never commit secrets, tokens, `.env` files or credentials. API keys are Codespaces secrets.
- The game is a static site: no runtime calls to third-party APIs, no keys in the bundle.
- New runtime dependencies need a written justification in the PR. Keep `package-lock.json` committed and install with
  `npm ci`.
- Report vulnerabilities privately to the maintainer, not in a public issue.
