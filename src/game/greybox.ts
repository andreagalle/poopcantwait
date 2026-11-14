import { CapsuleGeometry, Color, Entity, Mesh, MeshInstance } from 'playcanvas';
import type { AnimTrack, AppBase, Asset, ContainerResource } from 'playcanvas';

import { BENNY, WEIGHT } from '../config/tuning';
import type { BennyClip } from '../core/fx/benny-clip';
import { createFlatMaterial } from '../render/materials';

const BENNY_COLOR = new Color(0.98, 0.72, 0.58);
/** The clips his model carries (`npm run assets:merge-clips`), each looping except the fall, which ends lying down. */
const CLIPS: readonly BennyClip[] = ['idle', 'walk', 'run', 'waddle', 'fall'];

/**
 * Benny as the felt model of the art pass: 1.6 m tall like his plush body, feet on the ground, facing +z (his heading
 * 0), with an `anim` component holding his clips. Throws if a clip is missing, rather than leaving him in a T-pose.
 */
function bennyModel(model: Asset): Entity {
    const resource = model.resource as ContainerResource;
    const entity = resource.instantiateRenderEntity();
    entity.name = 'benny-model';
    entity.addComponent('anim', { activate: true });
    const tracks = resource.animations.map((asset) => asset.resource as AnimTrack);
    for (const clip of CLIPS) {
        const track = tracks.find((t) => t.name === clip);
        if (!track) {
            throw new Error(`Benny has no "${clip}" clip; he has ${tracks.map((t) => t.name).join(', ')}`);
        }
        entity.anim!.assignAnimation(clip, track, undefined, 1, clip !== 'fall');
    }
    return entity;
}

/** A peach capsule standing in for Benny: as wide as his collision circle at `w = 0`, as tall as the plush body. */
function standIn(app: AppBase): Entity {
    const geometry = new CapsuleGeometry({
        radius: WEIGHT.diameter.baseMetres / 2,
        height: BENNY.heightMetres,
        sides: 24
    });
    const mesh = Mesh.fromGeometry(app.graphicsDevice, geometry);
    const body = new Entity('benny-body');
    body.addComponent('render', {
        meshInstances: [new MeshInstance(mesh, createFlatMaterial('benny', BENNY_COLOR))],
        castShadows: true,
        receiveShadows: true
    });
    body.setLocalPosition(0, BENNY.heightMetres / 2, 0);
    return body;
}

/**
 * Benny in the scene: his felt model when it loaded, else the greybox capsule, standing on the ground with its pivot at
 * the base, under a `benny-pose` node for squash and stretch.
 */
export function addBenny(app: AppBase, model?: Asset): Entity {
    // `benny` carries where he is, his heading and his size; `benny-pose` the squash, hops and waddle on top
    const pose = new Entity('benny-pose');
    pose.addChild(model ? bennyModel(model) : standIn(app));
    const benny = new Entity('benny');
    benny.addChild(pose);
    app.root.addChild(benny);
    return benny;
}
