---
description: Generate, optimize and register one game asset (3D model or 2D image) following docs/ASSET_PIPELINE.md, on an assets/* branch.
argument-hint: <asset id, e.g. food.burger> [extra direction]
---

Asset to produce: $ARGUMENTS

Read `docs/ASSET_PIPELINE.md` and `docs/GAME_DESIGN.md` first, and follow them exactly.

1. Work on a topic branch named `assets/<asset-id-in-kebab-case>` (or the current `assets/*` branch if you are batching a set), created from an up-to-date `dev` as in `/feature` steps 1-2.
2. Write the generation prompt from the style block in `docs/ASSET_PIPELINE.md` plus the asset's own description. Never name an existing character, franchise, brand, logo, artist or real vehicle model in any prompt.
3. Before any paid call, post in chat: the asset id, the provider and tool, the exact prompt, the polygon and texture budget, and the expected credit cost. Check the balance with `meshy_check_balance` when using Meshy. Paid calls require the maintainer's approval in the permission prompt; if a call is declined, stop and ask what to change.
4. Prefer the cheapest path that meets the budget: one preview first, inspect it, refine only the preview you keep. Never generate more than three variants of one asset without asking.
5. Download raw outputs into `art/raw/<asset-id>/` (git-ignored). Never commit raw outputs.
6. Optimize into `public/assets/` with `npm run assets:optimize -- <input> <output> --preset <preset>`, then check the result with the `inspect-glb` and `calibrate-model` skills: scale in meters, pivot at the base, facing +Z (or the convention in `docs/ASSET_PIPELINE.md`), triangle count and file size within budget.
7. Load it in the game in a debug view or its real place, capture a screenshot into `tmp/screenshots/`, read it back and check it against the style guide.
8. Add or update its entry in `art/manifest.json` (provider, model or tool, task id, prompt, date, license note, triangles, bytes). Update `CREDITS.md` if the license requires attribution.
9. Commit with `feat(assets): add <asset-id>` and continue with `/feature` steps 8-13.
