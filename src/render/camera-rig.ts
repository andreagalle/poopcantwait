import type { Entity } from 'playcanvas';

import { BENNY, CAMERA } from '../config/tuning';
import type { BuildingIndex } from '../core/camera';
import { cameraDistanceAt, cameraPosition, lookAhead, occludingBuildings, smoothingFactor } from '../core/camera';
import type { Game } from '../core/game';
import { diameterAt, heightScaleAt } from '../core/player/weight';

import type { CityView } from './city-view';

/**
 * The camera rig (design: *Camera*): it follows Benny with damping and a small look-ahead in his direction of travel,
 * pulls back as he grows, never rotates, and fades the buildings that stand between it and him. Smoothing uses the
 * frame time: it is presentation, not game logic.
 */
export class CameraRig {
    private readonly camera: Entity;
    private readonly cityView: CityView;
    private readonly buildings: BuildingIndex;
    private focusX = 0;
    private focusZ = 0;
    private distance = 0;
    private placed = false;

    constructor(camera: Entity, cityView: CityView, buildings: BuildingIndex) {
        this.camera = camera;
        this.cityView = cityView;
        this.buildings = buildings;
    }

    /**
     * `benny` is Benny's interpolated position on screen; `dt` the frame time; `shake` an offset for the camera shake
     * (the buildings fade for the steady camera, so they do not flicker with it).
     */
    update(
        game: Game,
        benny: { x: number; z: number },
        dt: number,
        shake: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
    ): void {
        const player = game.player;
        const ahead = lookAhead(player.vx, player.vz);
        const targetX = benny.x + ahead.x;
        const targetZ = benny.z + ahead.z;
        const targetDistance = cameraDistanceAt(player.weight);
        if (this.placed) {
            const follow = smoothingFactor(CAMERA.followRatePerSecond, dt);
            this.focusX += (targetX - this.focusX) * follow;
            this.focusZ += (targetZ - this.focusZ) * follow;
            this.distance += (targetDistance - this.distance) * smoothingFactor(CAMERA.distanceRatePerSecond, dt);
        } else {
            this.focusX = targetX;
            this.focusZ = targetZ;
            this.distance = targetDistance;
            this.placed = true;
        }

        const position = cameraPosition({ x: this.focusX, z: this.focusZ }, this.distance);
        this.camera.setPosition(position.x + shake.x, position.y + shake.y, position.z + shake.z);

        // Lines of sight to Benny's middle, top and sides decide which buildings fade
        const radius = diameterAt(player.weight) / 2;
        const height = BENNY.heightMetres * heightScaleAt(player.weight);
        const targets = [
            { x: benny.x, y: height / 2, z: benny.z },
            { x: benny.x, y: height, z: benny.z },
            { x: benny.x - radius, y: height / 2, z: benny.z },
            { x: benny.x + radius, y: height / 2, z: benny.z }
        ];
        this.cityView.setFaded(occludingBuildings(this.buildings, position, targets));
    }
}
