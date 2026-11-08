import { Entity, StandardMaterial } from 'playcanvas';
import type { AppBase, Color } from 'playcanvas';

import { COLLISIONS, TRAFFIC } from '../config/tuning';
import type { Game } from '../core/game';
import { vehiclePose } from '../core/traffic/vehicles';
import type { Vehicle, VehicleType } from '../core/traffic/vehicles';
import { PALETTE } from '../render/palette';

const RADIANS_TO_DEGREES = 180 / Math.PI;
/** Most vehicles at once: the initial traffic at its maximum density. */
const POOL = {
    car: Math.round(TRAFFIC.initialCount.cars * TRAFFIC.maxDensityFactor),
    bus: Math.round(TRAFFIC.initialCount.buses * TRAFFIC.maxDensityFactor)
};
/** Wrecks flatten as well as shorten. */
const WRECK_HEIGHT_SHARE = 0.55;

function flat(name: string, color: Color): StandardMaterial {
    const m = new StandardMaterial();
    m.name = name;
    m.diffuse.copy(color);
    m.useMetalness = true;
    m.metalness = 0;
    m.gloss = 0.5;
    m.update();
    return m;
}

interface Slot {
    readonly root: Entity;
    readonly body: Entity;
    readonly top: Entity;
    readonly paint: StandardMaterial;
}

/**
 * Cars and buses (design: *Traffic*) in greybox: a car is a body and a cabin in a bright solid colour, a bus a long
 * orange body with a band of windows. Invented liveries only. A crumpled wreck is squashed and grey.
 */
export class VehicleView {
    private readonly slots: Record<VehicleType, Slot[]>;
    private readonly assigned = new Map<number, Slot>();
    private readonly wreck = flat('vehicle-wreck', PALETTE.wreck);

    constructor(app: AppBase) {
        const root = new Entity('vehicles');
        const cabin = flat('car-cabin', PALETTE.carCabin);
        const busWindows = flat('bus-windows', PALETTE.busWindows);
        const make = (type: VehicleType, i: number): Slot => {
            const size = TRAFFIC.size[type];
            const slot = new Entity(`vehicle-${type}-${i}`);
            const paint =
                type === 'car'
                    ? flat(`car-paint-${i}`, PALETTE.cars[i % PALETTE.cars.length])
                    : flat('bus-paint', PALETTE.bus);
            const body = new Entity('vehicle-body');
            const top = new Entity('vehicle-top');
            body.addComponent('render', { type: 'box', material: paint, castShadows: true });
            top.addComponent('render', {
                type: 'box',
                material: type === 'car' ? cabin : busWindows,
                castShadows: false
            });
            if (type === 'car') {
                body.setLocalScale(size.width, size.height * 0.55, size.length);
                body.setLocalPosition(0, size.height * 0.275 + 0.15, 0);
                top.setLocalScale(size.width * 0.85, size.height * 0.4, size.length * 0.5);
                top.setLocalPosition(0, size.height * 0.75, -size.length * 0.05);
            } else {
                body.setLocalScale(size.width, size.height * 0.9, size.length);
                body.setLocalPosition(0, size.height * 0.45 + 0.2, 0);
                top.setLocalScale(size.width * 1.02, size.height * 0.28, size.length * 0.9);
                top.setLocalPosition(0, size.height * 0.68, 0);
            }
            slot.addChild(body);
            slot.addChild(top);
            slot.enabled = false;
            root.addChild(slot);
            return { root: slot, body, top, paint };
        };
        this.slots = {
            car: Array.from({ length: POOL.car }, (_, i) => make('car', i)),
            bus: Array.from({ length: POOL.bus }, (_, i) => make('bus', i))
        };
        app.root.addChild(root);
    }

    update(game: Game): void {
        const live = new Map<number, Vehicle>(game.vehicles.map((v) => [v.id, v]));
        for (const [id, slot] of this.assigned) {
            if (!live.has(id)) {
                slot.root.enabled = false;
                this.assigned.delete(id);
            }
        }
        const used = new Set(this.assigned.values());
        for (const v of game.vehicles) {
            let slot = this.assigned.get(v.id);
            if (!slot) {
                slot = this.slots[v.type].find((s) => !used.has(s));
                if (!slot) {
                    continue;
                }
                used.add(slot);
                this.assigned.set(v.id, slot);
            }
            const pose = vehiclePose(game.lanes, v);
            const wrecked = v.wreckSecondsLeft > 0;
            slot.root.enabled = true;
            slot.root.setPosition(pose.x, 0, pose.z);
            slot.root.setEulerAngles(0, Math.atan2(pose.dx, pose.dz) * RADIANS_TO_DEGREES, 0);
            slot.root.setLocalScale(1, wrecked ? WRECK_HEIGHT_SHARE : 1, wrecked ? COLLISIONS.crumpledLengthShare : 1);
            const material = wrecked ? this.wreck : slot.paint;
            const instance = slot.body.render!.meshInstances[0];
            if (instance.material !== material) {
                instance.material = material;
            }
        }
    }
}
