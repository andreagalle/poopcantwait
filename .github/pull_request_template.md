## What

<!-- One or two sentences: what this PR changes for the player or the codebase. -->

## Why

<!-- The goal or the problem. Link the issue or milestone: Refs #<n>, milestone M<n>. -->

## How to see it in the game

<!-- Exact steps for the maintainer: which VS Code task, which URL parameters (?seed=, ?debug=1), what to do, what to expect. -->

1.

## Checklist

- [ ] The title is a Conventional Commit (`feat(scope): ...`) and the base branch is `dev`.
- [ ] `npm run check`, `npm run build` and `npm run test:e2e` pass.
- [ ] New or changed rules in `src/core/` have unit tests.
- [ ] I looked at the result (screenshots inspected) and saw no console errors.
- [ ] Gameplay numbers are in `src/config/tuning.ts`, and `docs/GAME_DESIGN.md` matches them.
- [ ] `CHANGELOG.md` has a line under `## [Unreleased]`.
- [ ] New assets are in `art/manifest.json` and within the budgets in `docs/ASSET_PIPELINE.md` (or: no new assets).
- [ ] No secrets, no runtime calls to third-party APIs, no new runtime dependency (or: justified below).

## Not verified

<!-- Anything you could not check, and why. Write "Nothing" if everything was verified. -->

## Maintainer action needed

<!-- Changes to protected files (.github/workflows, .devcontainer, .claude/settings.json, .claude/hooks, .mcp.json) as an exact diff. Write "None" otherwise. -->

None
