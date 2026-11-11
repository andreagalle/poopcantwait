import { Color, Entity, TONEMAP_NEUTRAL } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { CAMERA } from '../config/tuning';

const SKY_COLOR = new Color(0.62, 0.8, 0.93);

/** Creates the game camera: perspective, with the design's vertical field of view and pitch. */
export function createGameCamera(app: AppBase): Entity {
    const camera = new Entity('camera');
    camera.addComponent('camera', {
        fov: CAMERA.fovDegrees,
        clearColor: SKY_COLOR,
        nearClip: 0.5,
        farClip: 1000,
        toneMapping: TONEMAP_NEUTRAL
    });
    camera.setEulerAngles(-CAMERA.pitchDegrees, 0, 0);
    app.root.addChild(camera);
    return camera;
}
