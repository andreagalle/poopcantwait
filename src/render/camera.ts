import { Color, Entity, TONEMAP_NEUTRAL } from 'playcanvas';
import type { AppBase, Vec3 } from 'playcanvas';

import { CAMERA } from '../config/tuning';

const SKY_COLOR = new Color(0.62, 0.8, 0.93);

/** Creates the game camera: perspective, with the design's vertical field of view. */
export function createGameCamera(app: AppBase): Entity {
    const camera = new Entity('camera');
    camera.addComponent('camera', {
        fov: CAMERA.fovDegrees,
        clearColor: SKY_COLOR,
        nearClip: 0.5,
        farClip: 1000,
        toneMapping: TONEMAP_NEUTRAL
    });
    app.root.addChild(camera);
    return camera;
}

/**
 * Places the camera `distance` metres from `target`, above it and behind it (towards +Z, the bottom of the screen),
 * looking down at the design pitch. The camera never rotates around the vertical axis, so arrow keys stay
 * screen-relative.
 */
export function placeCamera(camera: Entity, target: Vec3, distance: number): void {
    const pitchRadians = (CAMERA.pitchDegrees * Math.PI) / 180;
    camera.setPosition(
        target.x,
        target.y + distance * Math.sin(pitchRadians),
        target.z + distance * Math.cos(pitchRadians)
    );
    camera.setEulerAngles(-CAMERA.pitchDegrees, 0, 0);
}
