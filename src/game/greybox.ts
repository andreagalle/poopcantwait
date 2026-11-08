import { CapsuleGeometry, Color, Entity, Mesh, MeshInstance } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { BENNY, CITY, WEIGHT } from '../config/tuning';
import { createFlatMaterial } from '../render/materials';

const GROUND_COLOR = new Color(0.8, 0.78, 0.72);
const BENNY_COLOR = new Color(0.98, 0.72, 0.58);

/** A flat ground plane the size of the city. Milestone M1 replaces it with the generated streets and blocks. */
export function addGround(app: AppBase): Entity {
    const ground = new Entity('ground');
    ground.addComponent('render', {
        type: 'plane',
        material: createFlatMaterial('ground', GROUND_COLOR),
        castShadows: false,
        receiveShadows: true
    });
    ground.setLocalScale(CITY.sizeMetres, 1, CITY.sizeMetres);
    app.root.addChild(ground);
    return ground;
}

/**
 * A peach capsule standing in for Benny at his slim size: as wide as his collision circle at `w = 0`, as tall as the
 * plush body, standing on the ground with its pivot at the base.
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

    const benny = new Entity('benny');
    benny.addChild(body);
    app.root.addChild(benny);
    return benny;
}
