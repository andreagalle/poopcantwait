---
description: Make sure an up-to-date release PR from dev to master exists. With "cut <x.y.z>", first version the changelog through a PR to dev. Never merges into master.
argument-hint: "[cut <x.y.z>]"
---

Arguments: $ARGUMENTS

The maintainer tests `dev` locally and merges the release PR into `master` by hand. You prepare it; you never merge, approve or push to `master`.

## Default mode (no arguments)

1. `git fetch origin --prune`. List what would ship: `git log --oneline origin/master..origin/dev`. If the list is empty, say there is nothing to release and stop.
2. Find the open release PR: `gh pr list --base master --head dev --state open --json number,url`.
3. Write the PR body to `tmp/release-pr.md` with these sections:
   - **Summary**: two or three sentences on what this release changes for the player.
   - **Changes**: the `## [Unreleased]` section of `CHANGELOG.md` on `origin/dev` (or the newest version section if it was just cut).
   - **Merged pull requests**: every PR merged into dev since the last release, as `#<number> <title>`.
   - **How to test**: "Run the VS Code task *Test dev: production preview*, open port 4173 (task *Ports: print game URLs*)", followed by a short checklist of the things worth trying in the game for these changes.
   - **Merge instructions**: "Merge with *Create a merge commit* (not squash). Optionally run *Release: tag master after merging*."
4. If no release PR exists: `gh pr create --base master --head dev --title "release: <proposed version or date>" --body-file tmp/release-pr.md`. Otherwise update it: `gh pr edit <number> --body-file tmp/release-pr.md`, and the title too if the version changed.
5. Reply with the PR link and its CI status (`gh pr checks <number>`).

## Cut mode (`cut <x.y.z>`)

Use it only when the maintainer asks for a versioned release.

1. Follow `/feature` steps 1-2 with the branch `chore/release-v<x.y.z>`.
2. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [<x.y.z>] - <YYYY-MM-DD>` and add a new empty `## [Unreleased]` above it. Set `"version": "<x.y.z>"` in `package.json` with `npm version <x.y.z> --no-git-tag-version`.
3. Commit as `chore(release): v<x.y.z>`, push, open the PR into `dev`, wait for green checks, merge it with `--squash --delete-branch`.
4. Run the default mode above with the title `release: v<x.y.z>`.
5. Remind the maintainer to run the task *Release: tag master after merging* once the release PR is merged.
