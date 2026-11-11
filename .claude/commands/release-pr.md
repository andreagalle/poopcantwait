---
description: Make sure an up-to-date release PR from dev to master exists. "cut <x.y.z>" versions it through a PR to dev; "publish" creates the tag and the GitHub Release after the maintainer merged it. Never merges into master.
argument-hint: "[cut <x.y.z> | publish]"
---

Arguments: $ARGUMENTS

The maintainer tests `dev` locally and merges the release PR into `master` by hand. You prepare it; you never merge, approve or push to `master`. Every merge into `master` is an official release (`CONTRIBUTING.md`, _Releases_): the release PR is versioned before you ask for the merge, and you publish the release right after it.

## Default mode (no arguments)

1. `git fetch origin --prune`. List what would ship: `git log --oneline origin/master..origin/dev`. If the list is empty, say there is nothing to release and stop.
2. Find the open release PR: `gh pr list --base master --head dev --state open --json number,url`.
3. Write the PR body to `tmp/release-pr.md` with these sections:
   - **Summary**: two or three sentences on what this release changes for the player.
   - **Changes**: the `## [Unreleased]` section of `CHANGELOG.md` on `origin/dev` (or the newest version section if it was just cut).
   - **Merged pull requests**: every PR merged into dev since the last release, as `#<number> <title>`.
   - **How to test**: "Run the VS Code task _Test dev: production preview_, open port 4173 (task _Ports: print game URLs_): the landing page, the game under `/gottago/`, the story under `/story/`", followed by a short checklist of the things worth trying for these changes.
   - **Merge instructions**: "Merge with _Create a merge commit_ (not squash). The agent then publishes `v<x.y.z>` (tag and GitHub Release)." Before the cut: "Not versioned yet: wait for `release: v<x.y.z>` in the title before merging."
4. If no release PR exists: `gh pr create --base master --head dev --title "release: <name> (not versioned yet)" --body-file tmp/release-pr.md`. Otherwise update it: `gh pr edit <number> --body-file tmp/release-pr.md`, and the title too if the version changed.
5. When you are about to report to the maintainer and `## [Unreleased]` has entries, run cut mode first: the maintainer may merge as soon as they read the report.
6. Reply with the PR link and its CI status (`gh pr checks <number>`).

## Cut mode (`cut <x.y.z>`)

Versions the release PR. Pick the version from the last tag (`git tag --list 'v*' --sort=-v:refname | head -1`): the next minor if the release adds features, the next patch if it only fixes.

1. Follow `/feature` steps 1-2 with the branch `chore/release-v<x.y.z>`.
2. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [<x.y.z>] - <YYYY-MM-DD>` and add a new empty `## [Unreleased]` above it. If `## [<x.y.z>]` already exists from an earlier cut whose tag does not exist yet, move the new `[Unreleased]` entries into it and update its date instead. Set `"version": "<x.y.z>"` in `package.json` with `npm version <x.y.z> --no-git-tag-version`. Add a stage for the release to the story and refresh `site/stats.json` (`AGENTS.md`, _The story page_).
3. Commit as `chore(release): v<x.y.z>`, push, open the PR into `dev`, wait for green checks, merge it with `--squash --delete-branch`.
4. Run the default mode above with the title `release: v<x.y.z>`.

## Publish mode (`publish`)

Run it right after the maintainer merged a release PR into `master`.

1. `git fetch origin --prune --tags`. The release is `origin/master` (its subject is `release: v<x.y.z> ...` or the merge of the release PR). Read the version with `git show origin/master:package.json`. If the tag `v<x.y.z>` already exists, the release PR was merged without a cut: stop, tell the maintainer, run cut mode with the next version and ask for a new merge.
2. Write the notes to `tmp/release-notes-v<x.y.z>.md`: one or two sentences on what the release brings; the links to the game (`https://andreagalle.github.io/poopcantwait/gottago/`), the story (`.../story/`) and the start page (`.../`); then the `## [<x.y.z>]` section of `CHANGELOG.md` at `origin/master`, without its heading.
3. Publish, as a plain top-level command (the guard checks it): `gh release create v<x.y.z> --target <full SHA of origin/master> --title "v<x.y.z>: <short name>" --notes-file tmp/release-notes-v<x.y.z>.md`. It creates the tag and the GitHub Release together; never push tags.
4. Check it with `gh release view v<x.y.z>`. If the story has no stage for the release yet, add one (`AGENTS.md`, _The story page_). Reply with the release link.
