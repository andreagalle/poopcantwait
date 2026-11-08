import { Color, Entity, SHADOW_PCF3_32F } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { CAMERA } from '../config/tuning';

/**
 * Warm afternoon light (design: *Art direction*): a soft sky-tinted ambient, so shaded sides are never black, and a
 * warm sun from the camera's side (bottom left of the screen), so the faces the player sees are lit and shadows fall
 * towards the top right.
 */
export function addSunlight(app: AppBase): Entity {
    app.scene.ambientLight = new Color(0.46, 0.5, 0.58);

    const sun = new Entity('sun');
    sun.addComponent('light', {
        type: 'directional',
        color: new Color(1, 0.93, 0.82),
        intensity: 1.1,
        castShadows: true,
        shadowType: SHADOW_PCF3_32F,
        // Cover everything the camera sees at its farthest pull-back
        shadowDistance: CAMERA.distance.maxWeightMetres * 1.5,
        shadowResolution: 2048,
        shadowBias: 0.2,
        normalOffsetBias: 0.05
    });
    // Lights shine along their local -Y: tilt the beam towards -Z (screen top), then swing it towards +X (right)
    sun.setEulerAngles(50, -35, 0);
    app.root.addChild(sun);
    return sun;
}
