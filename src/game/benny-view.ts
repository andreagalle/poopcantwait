import type { Entity } from 'playcanvas';

import type { Game } from '../core/game';
import { wrapAngle } from '../core/player/movement';
import { diameterAt, heightScaleAt } from '../core/player/weight';

const RADIANS_TO_DEGREES = 180 / Math.PI;
/** The accident shiver: a quick side-to-side tremble, in metres and cycles per second. */
const SHIVER = { amplitude: 0.06, frequency: 14 };
/** Knocked over by a vehicle, he lies tilted this far, in degrees. */
const KNOCKED_TILT = 75;
/** A belly bounce squashes him down and out for a moment. */
const BOUNCE = { squash: 0.75, bulge: 1.12 };

/**
 * Mirrors Benny's simulated state on his entity: position and facing interpolated between the last two fixed steps,
 * the size that goes with his weight (wider with his collision circle, taller up to the design's limit), a shiver
 * while he is frozen in an accident, lying tilted while knocked over, and a squash on a belly bounce.
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
        const shiver =
            game.phase === 'accident' ? SHIVER.amplitude * Math.sin(2 * Math.PI * SHIVER.frequency * game.time) : 0;
        const x = a.x + (b.x - a.x) * alpha + shiver;
        const z = a.z + (b.z - a.z) * alpha;
        const heading = a.heading + wrapAngle(b.heading - a.heading) * alpha;
        // Inside a toilet he is out of sight
        this.entity.enabled = game.phase !== 'relief';
        this.entity.setPosition(x, 0, z);
        this.entity.setEulerAngles(0, heading * RADIANS_TO_DEGREES, 0);
        if (game.stunSecondsLeft > 0) {
            this.entity.rotateLocal(KNOCKED_TILT, 0, 0);
        }
        const bounce = game.slowSecondsLeft > 0;
        const width = (diameterAt(b.weight) / this.slimDiameter) * (bounce ? BOUNCE.bulge : 1);
        this.entity.setLocalScale(width, heightScaleAt(b.weight) * (bounce ? BOUNCE.squash : 1), width);
    }
}
