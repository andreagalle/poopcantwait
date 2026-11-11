import { Entity } from 'playcanvas';
import type { AppBase, StandardMaterial } from 'playcanvas';

import { EFFECTS, TRAFFIC } from '../config/tuning';
import type { Puff, PuffKind } from '../core/fx/puffs';
import { burst, puffDiameter, stinkPuff, tickPuffs } from '../core/fx/puffs';
import { addTrauma, decayTrauma, shakeOffset, traumaFor } from '../core/fx/shake';
import type { Eaten, Game, GameEvent } from '../core/game';
import { diameterAt } from '../core/player/weight';
import { Rng } from '../core/rng';
import { vehiclePose } from '../core/traffic/vehicles';
import { createFlatMaterial } from '../render/materials';
import { PALETTE } from '../render/palette';

/** Seed of the puffs' own scatter; it never touches the run's random streams. */
const PUFF_SEED = 0x70756666;

/**
 * Game feel (design: *Game feel*): puffs of crumbs, leaves, smoke, dust and stink, and the camera shake. It reacts to
 * the simulation's events and advances with simulated time only, so it freezes with the pause and never changes the
 * run. Puffs are a fixed pool of spheres, one shared material per kind.
 */
export class Juice {
    private readonly rng = new Rng(PUFF_SEED);
    private readonly pool: Entity[];
    private readonly materials: Record<PuffKind, StandardMaterial>;
    private readonly reducedMotion: boolean;
    private puffs: Puff[] = [];
    private trauma = 0;
    private lastTime = 0;
    private stinkTimer = 0;
    private trailSecondsLeft = 0;
    private readonly wrecks = new Set<number>();

    constructor(app: AppBase) {
        this.materials = Object.fromEntries(
            Object.entries(PALETTE.puffs).map(([kind, color]) => [kind, createFlatMaterial(`puff-${kind}`, color)])
        ) as Record<PuffKind, StandardMaterial>;
        const root = new Entity('puffs');
        this.pool = Array.from({ length: EFFECTS.puffs.pool }, (_, i) => {
            const puff = new Entity(`puff-${i}`);
            puff.addComponent('render', { type: 'sphere', castShadows: false, receiveShadows: false });
            puff.enabled = false;
            root.addChild(puff);
            return puff;
        });
        app.root.addChild(root);
        this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    }

    /** A simulation event: shake the camera, raise dust, start the stink trail. */
    onEvent(event: GameEvent, game: Game): void {
        this.trauma = addTrauma(this.trauma, traumaFor(event));
        if (event === 'knocked') {
            this.add(burst('knocked', game.player.x, game.player.z, this.rng));
        }
        if (event === 'accidentOver') {
            this.trailSecondsLeft = EFFECTS.puffs.stinkTrail.seconds;
        }
    }

    /** Something Benny ate: crumbs for junk food, leaves for a vegetable. */
    onBite(bite: Eaten): void {
        this.add(burst(bite.kind.category === 'junk' ? 'bite' : 'vegetable', bite.x, bite.z, this.rng));
    }

    /** The camera offset to add this frame, in metres (none with reduced motion). */
    shake(game: Game): { x: number; y: number; z: number } {
        return this.reducedMotion ? { x: 0, y: 0, z: 0 } : shakeOffset(this.trauma, game.time);
    }

    update(game: Game): void {
        const dt = Math.max(0, game.time - this.lastTime);
        this.lastTime = game.time;
        this.trauma = decayTrauma(this.trauma, dt);

        // Smoke where a vehicle has just crumpled
        for (const v of game.vehicles) {
            if (v.wreckSecondsLeft > 0 && !this.wrecks.has(v.id)) {
                this.wrecks.add(v.id);
                // The smoke billows from the top of the wreck, not from inside it
                const pose = vehiclePose(game.lanes, v);
                this.add(burst('crumple', pose.x, pose.z, this.rng, TRAFFIC.size[v.type].height * 0.7));
            }
        }
        if (this.wrecks.size > 0) {
            const live = new Set(game.vehicles.map((v) => v.id));
            for (const id of this.wrecks) {
                if (!live.has(id)) {
                    this.wrecks.delete(id);
                }
            }
        }

        // The stink cloud: thick during an accident, a thin trail for a few seconds after
        const accident = game.phase === 'accident';
        this.trailSecondsLeft = accident ? 0 : Math.max(0, this.trailSecondsLeft - dt);
        if (accident || this.trailSecondsLeft > 0) {
            const every = accident ? EFFECTS.puffs.stink.everySeconds : EFFECTS.puffs.stinkTrail.everySeconds;
            this.stinkTimer -= dt;
            while (this.stinkTimer <= 0) {
                this.stinkTimer += every;
                const radius = diameterAt(game.player.weight) / 2;
                this.add([stinkPuff(game.player.x, game.player.z, radius, !accident, this.rng)]);
            }
        } else {
            this.stinkTimer = 0;
        }

        this.puffs = tickPuffs(this.puffs, dt);
        for (let i = 0; i < this.pool.length; i++) {
            const entity = this.pool[i]!;
            const puff = this.puffs[i];
            if (!puff) {
                entity.enabled = false;
                continue;
            }
            const d = puffDiameter(puff);
            entity.enabled = d > 0;
            entity.setPosition(puff.x, puff.y, puff.z);
            entity.setLocalScale(d, d, d);
            const material = this.materials[puff.kind];
            const instance = entity.render!.meshInstances[0]!;
            if (instance.material !== material) {
                instance.material = material;
            }
        }
    }

    /** Adds puffs; when the pool is full, the oldest give way. */
    private add(puffs: Puff[]): void {
        this.puffs.push(...puffs);
        const excess = this.puffs.length - this.pool.length;
        if (excess > 0) {
            this.puffs.splice(0, excess);
        }
    }
}
