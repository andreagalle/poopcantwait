import { CapsuleGeometry, Color, Entity, Mesh, MeshInstance } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { BENNY, WEIGHT } from '../config/tuning';
import { createFlatMaterial } from '../render/materials';

const BENNY_COLOR = new Color(0.98, 0.72, 0.58);

/**
 * A peach capsule standing in for Benny at his slim size: as wide as his collision circle at `w = 0`, as tall as the
 * plush body, standing on the ground with its pivot at the base, under a `benny-pose` node for squash and stretch.
 */
export function addBennyStandIn(app: AppBase): Entity {
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

    // `benny` carries where he is, his heading and his size; `benny-pose` the squash, hops and waddle on top
    const pose = new Entity('benny-pose');
    pose.addChild(body);
    const benny = new Entity('benny');
    benny.addChild(pose);
    app.root.addChild(benny);
    return benny;
}
