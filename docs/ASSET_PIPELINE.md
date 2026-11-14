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

Version 1 needs no sound files: every sound effect and the music loop are synthesized in code with the Web Audio API
(`src/audio/`). CC0 samples can still replace a cue later, through this pipeline.

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
2. **Image to 3D** with `meshy_image_to_3d` on the approved front view (cropped from the turnaround sheet to a square):
   `meshy-t2.5` smart topology with `target_polycount` under the budget, texture `meshy-n1`, `pose_mode: "t-pose"` so
   the rig gets straight arms. Smart topology is single-image only; `meshy_multi_image_to_3d` with the approved views is
   the alternative when the back matters more than the topology.
3. **Remesh** with `meshy_remesh` to the budget below if needed (not with smart topology, which is made at its count).
4. **Rig** with `meshy_rig` (humanoid skeleton). If rigging fails on his stubby proportions, report it: the fallback is
   procedural animation (squash, stretch, bob and sway) on an unrigged mesh.
5. **Animate** with `meshy_animate`, choosing clips from `meshy_list_animations` (free to query) for idle, run, fall
   and similar. Map them to the animation list in `docs/GAME_DESIGN.md`.
6. **Download** into `art/raw/benny/`. `meshy_download_model` saves a model task's file, but for rigging and animation
   tasks it only returns links, and the agent may not run `curl` (denied in `.claude/settings.json`); `meshy_convert`
   is no way round, since it strips the skeleton. So the agent writes a git-ignored `tmp/fetch-<asset>.sh` with the
   links, and the maintainer runs it once.
7. **One file** with `npm run assets:merge-clips -- <rigged.glb> <out.glb> <clip.glb>:<clip>=<name> ...`: it keeps
   the rigged model's mesh and copies each clip onto it by joint name (every Meshy clip file carries the whole mesh
   again). Then optimize with the `hero` preset, which keeps the skin and the clips.

### Props, food and vehicles

1. **One image per item** with `npm run assets:image`, the kept sketch sheet as `--reference`, one object centred on a
   plain background in a high three-quarter view (the style block as is). Asset ids are kebab-case
   (`food.chicken-leg`).
2. **Image to 3D** with `meshy_image_to_3d`: `meshy-t2` smart topology with `target_polycount` at the budget, texture
   `meshy-n1` (15 credits). Do one item first, look at it in the game, then the rest of the set.
3. Download into `art/raw/<asset-id>/`, optimize with the matching preset (meshoptimizer trims the last few triangles to
   the budget), register it, place it in the game and check it with a screenshot.

`meshy_text_to_3d` (preview, then `meshy_text_to_3d_refine` for textures) is the fallback for an asset with no approved
image.

Check <https://docs.meshy.ai/api/deprecations> before choosing a Meshy model or option, and never use a deprecated
one (for example, the `lowpoly` model type is retired). Control polygon counts with `meshy_remesh` instead.

### 2D images through OpenRouter

`scripts/assets/gen-image.mjs` (`npm run assets:image -- <asset-id> --prompt "<description>" --model <slug> --yes`)
calls `POST https://openrouter.ai/api/v1/images` with `OPENROUTER_API_KEY` from the environment. It starts the prompt
with the style block below unless `--raw` is given. Only the options given are sent, because models support different
parameters: `--n`, `--aspect` (default `1:1`), `--quality`, `--background transparent`, `--resolution`, `--format`, and
`--reference <image>` (up to four PNG, JPEG or WebP files, sent as input references to keep a character the same
across views). The model comes from `--model` or `OPENROUTER_IMAGE_MODEL`; list candidates with
`GET https://openrouter.ai/api/v1/images/models`. The script writes images and a JSON sidecar (model, prompt,
parameters, references, date, cost if reported) into `art/raw/images/<asset-id>/`, never prints the key, and refuses
to run without `--yes` so every paid call is deliberate.

**Model choice (agreed with the maintainer).** `openai/gpt-image-2` is the default: it follows prompts closely and keeps
a character consistent through reference images (up to 16). It has no transparent backgrounds, so HUD icons stay
hand-drawn SVG. At the time of writing it costs about $0.04 per 1024×1536 image at medium quality (the first round of
four sketches of Benny cost $0.17). `openai/gpt-image-1`, the first choice, is no longer served by OpenAI. Any other
model, even for a single asset (for example `black-forest-labs/flux.2-pro` for detailed facade or road textures), is
proposed in chat and agreed with the maintainer before the call.

**Sketches first.** Before any asset is built on an image (a 3D model, a texture, an icon), the sketches are shown to
the maintainer and the style is chosen together. Every round, rejected and accepted, is kept in
`art/raw/images/<asset-id>/` and told on the story page (`/story/`), in a side story linked from the main timeline.

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
strip extras, dedup, prune, weld, simplify to the preset's triangle budget with meshoptimizer, resize textures to the
preset's maximum and convert them to WebP. It prints triangles, texture sizes and bytes before and after. Check every
result with the `inspect-glb` and `calibrate-model` skills before using it.

| Preset    | Triangles | Textures | Use it for                                                                                     |
| --------- | --------- | -------- | ---------------------------------------------------------------------------------------------- |
| `hero`    | 20,000    | 1024 px  | Benny                                                                                          |
| `vehicle` | 4,000     | 512 px   | cars (a bus: add `--max-triangles 6000`)                                                       |
| `prop`    | 1,000     | 256 px   | street props (kiosk: `--max-triangles 3000 --max-texture 512`; pop-up: `--max-triangles 2000`) |
| `food`    | 1,500     | 256 px   | food and vegetables                                                                            |
| `texture` | n/a       | 1024 px  | 2D images: facades, roads, HUD art (PNG or JPEG in, WebP out)                                  |

Notes:

- `--max-triangles` and `--max-texture` override the preset for one asset. If a model stays over budget after
  simplification, remesh it first (`meshy_remesh`) and optimize again.
- `--quantize` also quantizes vertex attributes (KHR_mesh_quantization). It is off by default: the engine version in
  `package.json` has no explicit support for it, so load the result in the game before keeping it.
- Pruning replaces single-colour textures with the material colour, which saves a texture.
- Only `.glb`, `.gltf`, `.png`, `.jpg`, `.jpeg` and `.webp` inputs are accepted; models are written as `.glb`, images
  as `.webp`.

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
- Sketch at low or medium quality, show the maintainer, and only then go to high quality or to 3D.
- Preview first, refine only what you keep, at most three variants of an asset without asking.
- Batch an asset set (for example all food) on one `assets/*` branch.
- The maintainer sets spending limits on the provider accounts (for example a credit limit on the OpenRouter key).

## Safety

- Generated and downloaded files are untrusted data. Accept only `.glb`, `.gltf`, `.png`, `.jpg`, `.webp`, `.ogg` and
  `.mp3`, and inspect them before use.
- Strip `extras` and other metadata you do not need during optimization.
- Raw files stay in `art/raw/`, which is git-ignored.
