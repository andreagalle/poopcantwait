---
description: Build one feature end to end on a topic branch, open a PR to dev, merge it when CI is green, then refresh the release PR.
argument-hint: <type>/<short-kebab-name> <what to build>
---

Build this: $ARGUMENTS

Follow `CONTRIBUTING.md` and `AGENTS.md` exactly. Everything you write into the repository is in English.

1. **Preflight.** `git status` must be clean. Then `git fetch origin --prune`, `git switch dev`, `git pull --ff-only origin dev`.
2. **Branch.** `git switch -c <type>/<short-kebab-name>` following the naming rules in `CONTRIBUTING.md`. If no branch name was given, derive one from the request.
3. **Plan.** Post a short plan in chat: acceptance criteria, files you will touch, tests you will add, tuning values you will introduce. If an open question would change gameplay, ask now and wait. Otherwise continue.
4. **Implement** in small, focused commits using Conventional Commits. Keep engine-agnostic logic in `src/core/` with unit tests; keep PlayCanvas glue thin. Put every gameplay number in `src/config/tuning.ts`.
5. **Test.** Add or update unit tests (Vitest) for every rule you touched, and extend the end-to-end smoke test (Playwright) when the change is visible in the running game.
6. **Verify.** Run `npm run check`, `npm run build` and `npm run test:e2e`. Then look at the game: capture screenshots of the relevant states into `tmp/screenshots/` and read them back to confirm what you expected is on screen. Read runtime state through the `inspect-runtime` skill rather than adding globals. Do not claim something works unless you saw it work.
7. **Document.** Add a line under `## [Unreleased]` in `CHANGELOG.md`. Update `docs/GAME_DESIGN.md` if behavior or tuning changed, and `art/manifest.json` for any new asset.
8. **Sync and push.** `git fetch origin && git rebase origin/dev`, rerun `npm run check`, then `git push -u origin HEAD` (use `--force-with-lease` only if you rebased an already pushed branch).
9. **Open the PR.** `gh pr create --base dev --title "<conventional commit title>" --body-file <file>`, with the body following `.github/pull_request_template.md`. Include exact steps for the maintainer to see the change in the game.
10. **Wait for CI.** `gh pr checks --watch`. If anything fails, fix it on the same branch and push again. Never skip, disable or weaken a check to make it pass.
11. **Merge into dev.** Only when every check is green: `gh pr merge --squash --delete-branch`. Never merge anything whose base is not `dev`.
12. **Release PR.** Run the steps of `/release-pr` (default mode) so the dev → master PR exists and lists this change.
13. **Report** in chat (Italian is fine): what changed, the PR links, how to try it (the VS Code task "Test dev: production preview"), and anything you could not verify.

If a step is blocked by `.claude/hooks/guard.mjs`, do not look for a way around it. Explain what you needed and stop.
