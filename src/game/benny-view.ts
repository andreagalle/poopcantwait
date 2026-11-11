import type { Entity } from 'playcanvas';

import { decayEatPulse, squashPose, stridePhaseDelta } from '../core/fx/squash';
import type { Game } from '../core/game';
import { wrapAngle } from '../core/player/movement';
import { diameterAt, heightScaleAt, topSpeedAt } from '../core/player/weight';
import { isLow } from '../core/urgency/urgency';

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
 * while he is frozen in an accident, lying tilted while knocked over, and a squash on a belly bounce. On top of that,
 * the `benny-pose` child hops, waddles, breathes, jiggles nervously on a low countdown and stretches on each bite
 * (squash and stretch, design: *The protagonist*); the `benny` entity itself keeps his true position and size.
 */
export class BennyView {
    readonly entity: Entity;
    private readonly pose: Entity;
    private readonly slimDiameter = diameterAt(0);
    private stridePhase = 0;
    private eatPulse = 0;
    private lastX: number | null = null;
    private lastZ = 0;
    private lastTime = 0;

    constructor(entity: Entity) {
        this.entity = entity;
        this.pose = entity.findByName('benny-pose') as Entity;
    }

    /** A quick stretch, when he eats. */
    bite(): void {
        this.eatPulse = 1;
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
        const knocked = game.stunSecondsLeft > 0;
        if (knocked) {
            this.entity.rotateLocal(KNOCKED_TILT, 0, 0);
        }
        const bounce = game.slowSecondsLeft > 0;
        const width = (diameterAt(b.weight) / this.slimDiameter) * (bounce ? BOUNCE.bulge : 1);
        this.entity.setLocalScale(width, heightScaleAt(b.weight) * (bounce ? BOUNCE.squash : 1), width);

        // Squash and stretch, advanced by what happened on screen since the last frame (nothing while paused)
        const moved = this.lastX === null ? 0 : Math.hypot(x - shiver - this.lastX, z - this.lastZ);
        this.lastX = x - shiver;
        this.lastZ = z;
        this.stridePhase += stridePhaseDelta(moved, b.weight);
        this.eatPulse = decayEatPulse(this.eatPulse, Math.max(0, game.time - this.lastTime));
        this.lastTime = game.time;
        const playing = game.phase === 'playing' && !knocked;
        const pose = squashPose({
            stridePhase: this.stridePhase,
            speedShare: playing ? Math.hypot(b.vx, b.vz) / topSpeedAt(b.weight) : 0,
            time: game.time,
            nervous: playing && isLow(game.urgency),
            eatPulse: this.eatPulse
        });
        this.pose.setLocalPosition(0, pose.lift, 0);
        this.pose.setLocalEulerAngles(0, 0, pose.rollDegrees);
        this.pose.setLocalScale(pose.sxz, pose.sy, pose.sxz);
    }
}
