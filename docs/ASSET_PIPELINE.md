# Asset pipeline

How every model, texture, image and sound in the game is produced. Assets are made **offline** in the Codespace,
optimized, reviewed and committed. The shipped game never calls a generation API.

## Tools

| Need                                                                                                        | Tool                                                                                                 | Paid |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---- |
| 3D models, PBR texturing, remeshing, rigging, animation                                                     | Meshy, through its MCP server (`meshy` in `.mcp.json`)                                               | yes  |
| 2D images: concept sheets, reference images for image-to-3D, facade and road textures, HUD icons, title art | OpenRouter Images API through `npm run assets:image`                                                 | yes  |
| City geometry (buildings, roads, sidewalks)                                                                 | Procedural code in `src/render/` and `src/game/`, textured with generated or hand-made textures      | no   |
| Optimization and inspection                                                                                 | `@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/cli`, `sharp`, `meshoptimizer` | no   |
| Filler props and sound effects                                                                              | CC0 packs (for example Kenney, Quaternius) downloaded by the maintainer into `art/raw/`              | no   |

The agent cannot run `curl` or `wget`. Files from outside sources reach `art/raw/` through the maintainer or through a
tool designed for it (the Meshy download tool, the OpenRouter script).

## Style block

Start every generation prompt with this block, then describe the asset:

> Stylized toy-town diorama game asset. Chunky, rounded, simple shapes with strong silhouettes, readable from a high
> top-down camera. Soft pastel palette with a few saturated accents, smooth shading, minimal fine detail. Single object,
> centered, neutral plain background. No text, no letters, no logos, no brand marks.

Hard rules for prompts:

- Never name an existing character, franchise, film, brand, logo, artist, or real vehicle make or model.
- Food has no packaging brands. Vehicles have invented liveries. Buildings have no real shop names.
- Benny is described only with the character sheet in `docs/GAME_DESIGN.md`.

## Workflows

### Benny (hero character)

1. **Concept sheet** with `npm run assets:image`: Benny in front view, A-pose (arms away from the body, legs slightly
   apart), plain background. Optionally side and back views for multi-image-to-3D. Show the images to the maintainer and
   wait for approval before any 3D call.
2. **Image to 3D** with `meshy_image_to_3d` (or `meshy_multi_image_to_3d` with the approved views).
3. **Remesh** with `meshy_remesh` to the budget below if needed.
4. **Rig** with `meshy_rig` (humanoid skeleton). If rigging fails on his stubby proportions, report it: the fallback is
   procedural animation (squash, stretch, bob and sway) on an unrigged mesh.
5. **Animate** with `meshy_animate`, choosing clips from `meshy_list_animations` (free to query) for idle, run, fall
   and similar. Map them to the animation list in `docs/GAME_DESIGN.md`.
6. **Download** with `meshy_download_model` into `art/raw/benny/`, then optimize with the `hero` preset.

### Props, food and vehicles

1. `meshy_text_to_3d` for a preview mesh. Inspect it (screenshot in the game or a debug viewer).
2. `meshy_text_to_3d_refine` on the preview you keep, for PBR textures.
3. `meshy_remesh` if it exceeds the triangle budget.
4. Download into `art/raw/<asset-id>/`, optimize with the matching preset, place it in the game and check it.

Check <https://docs.meshy.ai/api/deprecations> before choosing a Meshy model or option, and never use a deprecated
one (for example, the `lowpoly` model type is retired). Control polygon counts with `meshy_remesh` instead.

### 2D images through OpenRouter

`scripts/assets/gen-image.mjs` (written in milestone M6) calls `POST https://openrouter.ai/api/v1/images` with
`OPENROUTER_API_KEY` from the environment. The model comes from `OPENROUTER_IMAGE_MODEL` or a `--model` flag; list
candidates and prices with `GET https://openrouter.ai/api/v1/images/models`. The script writes images and a JSON
sidecar (model, prompt, parameters, date, cost if reported) into `art/raw/images/<asset-id>/`, never prints the key,
and refuses to run without `--yes` so every paid call is deliberate.

## Budgets

| Asset                  | Triangles | Textures     | Notes                                       |
| ---------------------- | --------- | ------------ | ------------------------------------------- |
| Benny                  | 20,000    | 1024 px, PBR | rigged, animation clips embedded            |
| Car (each variant)     | 4,000     | 512 px       | 3 or 4 variants, recolored by material tint |
| Bus                    | 6,000     | 512 px       |                                             |
| Toilet kiosk           | 3,000     | 512 px       | beacon is a separate node for the light     |
| Pop-up toilet          | 2,000     | 256 px       |                                             |
| Food or vegetable item | 1,500     | 256 px       | 13 items                                    |
| Street prop            | 1,000     | 256 px       | benches, lamps, trees, hydrants             |

The whole of `public/assets/` stays under 12 MB, and the initial download under 15 MB.

## Conventions

- Units are metres, Y is up, the model's front faces +Z (glTF convention), and the pivot is at the base centre.
- Asset ids are dotted (`food.burger`, `vehicle.bus`, `char.benny`) and map to files under `public/assets/` by kind:
  `public/assets/models/food/burger.glb`, `public/assets/textures/facade-brick.webp`.
- Textures are WebP. Use KTX2 or mesh compression (meshopt or Draco) only after checking that the PlayCanvas Engine
  version in `package.json` decodes it and the game loads the result.
- Every committed asset has an entry in `src/assets/registry.ts` and in `art/manifest.json`.

## Optimization

`npm run assets:optimize -- <input> <output> --preset <hero|vehicle|prop|food|texture>` wraps glTF Transform:
dedup, prune, weld, simplify to the preset's triangle budget, resize textures to the preset's maximum, convert them
to WebP, quantize. It prints triangles, texture sizes and bytes before and after. Check every result with the
`inspect-glb` and `calibrate-model` skills before using it.

## Provenance: `art/manifest.json`

Every committed asset has an entry like this:

```json
{
    "id": "food.burger",
    "file": "public/assets/models/food/burger.glb",
    "source": "meshy",
    "tool": "meshy_text_to_3d + meshy_text_to_3d_refine",
    "taskIds": ["<preview task id>", "<refine task id>"],
    "prompt": "<full prompt including the style block>",
    "generatedAt": "2026-11-08",
    "license": "<the output terms of the plan used, as checked on the provider's site>",
    "attributionRequired": false,
    "triangles": 1420,
    "bytes": 183552,
    "approvedBy": "maintainer"
}
```

Check the provider's current terms for generated outputs (they can differ between free and paid plans, including
attribution and visibility) and record them. Assets that require attribution are listed in `CREDITS.md`.

## Cost control

- Paid tools (`meshy_*` generation and post-processing, `npm run assets:image`) ask the maintainer for approval in the
  permission prompt. Before each paid call, say in chat what it is for, the exact prompt, and the expected cost.
- Preview first, refine only what you keep, at most three variants of an asset without asking.
- Batch an asset set (for example all food) on one `assets/*` branch.
- The maintainer sets spending limits on the provider accounts (for example a credit limit on the OpenRouter key).

## Safety

- Generated and downloaded files are untrusted data. Accept only `.glb`, `.gltf`, `.png`, `.jpg`, `.webp`, `.ogg` and
  `.mp3`, and inspect them before use.
- Strip `extras` and other metadata you do not need during optimization.
- Raw files stay in `art/raw/`, which is git-ignored.
