import type { Entity } from 'playcanvas';

import type { Game } from '../core/game';
import { wrapAngle } from '../core/player/movement';
import { diameterAt, heightScaleAt } from '../core/player/weight';

const RADIANS_TO_DEGREES = 180 / Math.PI;

/**
 * Mirrors Benny's simulated state on his entity: position and facing interpolated between the last two fixed steps,
 * and the size that goes with his weight (wider with his collision circle, taller up to the design's limit).
 */
export class BennyView {
    readonly entity: Entity;
    private readonly slimDiameter = diameterAt(0);

    constructor(entity: Entity) {
        this.entity = entity;
    }

    update(game: Game, alpha: number): void {
        const a = game.previousPlayer;
        const b = game.player;
        const x = a.x + (b.x - a.x) * alpha;
        const z = a.z + (b.z - a.z) * alpha;
        const heading = a.heading + wrapAngle(b.heading - a.heading) * alpha;
        this.entity.setPosition(x, 0, z);
        this.entity.setEulerAngles(0, heading * RADIANS_TO_DEGREES, 0);
        const width = diameterAt(b.weight) / this.slimDiameter;
        this.entity.setLocalScale(width, heightScaleAt(b.weight), width);
    }
}
