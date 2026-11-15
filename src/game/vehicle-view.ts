import { Entity, StandardMaterial } from 'playcanvas';
import type { AppBase, Asset, Color, Material, MeshInstance, RenderComponent } from 'playcanvas';

import type { AssetId } from '../assets/registry';
import { COLLISIONS, TRAFFIC } from '../config/tuning';
import type { Game } from '../core/game';
import { vehiclePose } from '../core/traffic/vehicles';
import type { Vehicle, VehicleType } from '../core/traffic/vehicles';
import { PALETTE } from '../render/palette';

import { fittedModel } from './fit-model';

const RADIANS_TO_DEGREES = 180 / Math.PI;
/** Most vehicles at once: the initial traffic at its maximum density. */
const POOL = {
    car: Math.round(TRAFFIC.initialCount.cars * TRAFFIC.maxDensityFactor),
    bus: Math.round(TRAFFIC.initialCount.buses * TRAFFIC.maxDensityFactor)
};
/** The felt models (art pass, milestone M6): the cars take turns through four, the buses share one. */
export const VEHICLE_MODELS = {
    car: ['vehicle.car-green', 'vehicle.car-orange', 'vehicle.van-blue', 'vehicle.car-yellow'],
    bus: ['vehicle.bus-red']
} as const satisfies Record<VehicleType, readonly AssetId[]>;
/** The models' noses point along -x: a quarter turn points them along +z, the way they drive. */
const MODEL_YAW_DEGREES = 90;

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
    /** The felt model's meshes and their own materials, to turn grey while wrecked; empty on the greybox. */
    readonly model: readonly { instance: MeshInstance; material: Material }[];
}

/**
 * Cars and buses (design: *Traffic*): felt models stretched to their size in the game, the cars taking turns through
 * four of them; in greybox, until the models have loaded, a car is a body and a cabin in a bright solid colour and a bus
 * a long orange body with a band of windows. Invented liveries only. A crumpled wreck is squashed and grey.
 */
export class VehicleView {
    private readonly slots: Record<VehicleType, Slot[]>;
    private readonly assigned = new Map<number, Slot>();
    private readonly wreck = flat('vehicle-wreck', PALETTE.wreck);

    constructor(app: AppBase, models: ReadonlyMap<AssetId, Asset> = new Map()) {
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
            const ids = VEHICLE_MODELS[type];
            const asset = models.get(ids[i % ids.length]);
            const model: { instance: MeshInstance; material: Material }[] = [];
            if (asset) {
                const felt = fittedModel(
                    asset,
                    { width: size.width, height: size.height, length: size.length, yawDegrees: MODEL_YAW_DEGREES },
                    'vehicle-model'
                );
                slot.addChild(felt);
                body.enabled = false;
                top.enabled = false;
                for (const render of felt.findComponents('render') as RenderComponent[]) {
                    for (const instance of render.meshInstances) {
                        if (instance.material) {
                            model.push({ instance, material: instance.material });
                        }
                    }
                }
            }
            slot.enabled = false;
            root.addChild(slot);
            return { root: slot, body, top, paint, model };
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
            if (slot.model.length > 0) {
                for (const { instance, material } of slot.model) {
                    const wanted = wrecked ? this.wreck : material;
                    if (instance.material !== wanted) {
                        instance.material = wanted;
                    }
                }
                continue;
            }
            const material = wrecked ? this.wreck : slot.paint;
            const instance = slot.body.render!.meshInstances[0];
            if (instance.material !== material) {
                instance.material = material;
            }
        }
    }
}
