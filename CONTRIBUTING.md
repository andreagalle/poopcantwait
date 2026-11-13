# Contributing

These rules apply to everyone who changes this repository, human or AI agent. Everything that lands in the repository
is written in English.

## Branch model

| Branch         | Purpose                                                   | Who writes to it                                |
| -------------- | --------------------------------------------------------- | ----------------------------------------------- |
| `master`       | Production. Every push deploys the game to GitHub Pages.  | Only the maintainer, by merging the release PR. |
| `dev`          | Integration. Always builds and passes CI.                 | Only through pull requests from topic branches. |
| topic branches | One change each: a feature, a fix, a chore, an asset set. | Their author. Short-lived, deleted after merge. |

Nobody commits or pushes to `master` or `dev` directly. Changes flow one way:

```text
topic branch --(PR, squash merge)--> dev --(release PR, squash merge, maintainer only)--> master --> GitHub Pages
```

## Topic branch names

Format: `<type>/<short-description>`, optionally with an issue number: `<type>/<issue>-<short-description>`.

- Lowercase ASCII, words separated by hyphens, no spaces, at most 50 characters after the slash.
- Describe the outcome, not the activity: `feat/toilet-occupancy`, not `feat/working-on-toilets`.
- One branch, one purpose. If the description needs "and", split the branch.

| Type        | Use it for                                                     | Example                         |
| ----------- | -------------------------------------------------------------- | ------------------------------- |
| `feat/`     | New gameplay or user-visible behavior                          | `feat/12-urgency-countdown`     |
| `fix/`      | A bug fix                                                      | `fix/player-stuck-in-alley`     |
| `perf/`     | Performance work with no behavior change                       | `perf/instanced-buildings`      |
| `refactor/` | Code restructuring with no behavior change                     | `refactor/split-traffic-system` |
| `test/`     | Tests only                                                     | `test/toilet-scheduler-edges`   |
| `assets/`   | Generating, replacing or optimizing art and audio              | `assets/food-set`               |
| `docs/`     | Documentation only                                             | `docs/tuning-tables`            |
| `chore/`    | Tooling, dependencies, configuration, releases                 | `chore/release-v0.3.0`          |
| `ci/`       | Proposed CI changes (applied by the maintainer, see below)     | `ci/cache-playwright`           |
| `hotfix/`   | Urgent production fix branched from `master` (maintainer only) | `hotfix/blank-screen-safari`    |

## Working on a change

1. Start from an up-to-date `dev`:

    ```sh
    git fetch origin --prune
    git switch dev
    git pull --ff-only origin dev
    git switch -c feat/short-description
    ```

2. Commit in small, focused steps (see _Commit messages_). Keep the branch building at every commit.
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

Every merge into `master` is an official release: a version in `package.json`, its section in `CHANGELOG.md`, a
`v<x.y.z>` tag and a GitHub Release whose notes are that section. Nobody has to ask for one.

1. The release PR from `dev` into `master` stays open and is refreshed after every merge into `dev` (the agent runs
   `/release-pr`).
2. Before asking the maintainer to merge it, the agent versions it with `/release-pr cut <x.y.z>` (`CHANGELOG.md` and
   `package.json`, through a PR into `dev`), and the release PR title becomes `release: v<x.y.z>`. A release PR
   without a version in its title is not ready to merge.
3. The maintainer tests `dev` in the Codespace with the VS Code task **Test dev: production preview** (the same build
   GitHub Pages will serve, on port 4173: the landing page, the game under `/gottago/`, the story under `/story/`), or
   **Test dev: dev server** (the game only, with hot reload) for a quick look.
4. The maintainer merges the release PR with **Squash and merge**: their choice, so `master` reads as one commit per
   release. The deploy workflow publishes `master` to GitHub Pages.
5. Right after the merge, the agent publishes the release with `/release-pr publish`:
   `gh release create v<x.y.z> --target <the squash commit>` creates the tag and the GitHub Release together.
   `.claude/hooks/guard.mjs` allows only that form, for a commit on `master` whose `package.json` has that version;
   deleting releases and pushing tags stay with the maintainer. A GitHub Actions workflow is planned to take over this
   step.
6. Then the agent realigns `dev` with `master`. A squash commit has a single parent, so `dev`'s history does not
   contain it; left alone, the next release PR would show every earlier release again. On a
   `chore/sync-master-into-dev-v<x.y.z>` branch from `dev`, the agent checks that `master`'s tree equals `dev` at the
   cut, merges `origin/master` with `git merge -s ours` (no file changes, only the parent), and merges that PR into
   `dev` with a **merge commit**: a squash would drop the very parent it records. The merge base of the two branches
   is then the release.

Versions follow [Semantic Versioning](https://semver.org/) in the `0.x` range until the game is feature-complete: the
minor version for a release that adds features, the patch version for one that only fixes. `CHANGELOG.md` follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/): every PR into `dev` adds a line under `## [Unreleased]`,
and the cut turns that section into the version's.

### Hotfixes

Only the maintainer creates `hotfix/*` branches, from `master`, with a PR into `master`. Right after the merge, open a
`chore/sync-master-into-dev` branch from `dev` that merges `origin/master` normally (not `-s ours`: here `dev` needs
the fix's changes), and merge it into `dev` with a merge commit.

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
