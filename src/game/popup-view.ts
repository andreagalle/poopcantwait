import { BLEND_ADDITIVE, CylinderGeometry, Entity, Mesh, MeshInstance, StandardMaterial } from 'playcanvas';
import type { AppBase, Asset, Color } from 'playcanvas';

import { POPUP_TOILETS } from '../config/tuning';
import type { Game } from '../core/game';
import { PALETTE } from '../render/palette';

import { fittedModel } from './fit-model';
import { DOOR_SIGN } from './kiosk-view';

const CABIN_HEIGHT = 2.3;
const DOOR = { width: 0.9, height: 1.8, depth: 0.06 };
const BEACON = { size: 0.45, height: 0.35 };
const BEAM = { radius: 0.3, height: 8, opacity: 0.35 };
/** Pop in with a little overshoot over this many seconds, and sink back over the last ones, in seconds. */
const POP_IN_SECONDS = 0.35;
const SINK_SECONDS = 0.5;

function material(name: string, color: Color, emissive = false, opacity = 1): StandardMaterial {
    const m = new StandardMaterial();
    m.name = name;
    if (emissive) {
        m.diffuse.set(0, 0, 0);
        m.emissive.copy(color);
        m.useLighting = false;
    } else {
        m.diffuse.copy(color);
        m.useMetalness = true;
        m.metalness = 0;
        m.gloss = 0.35;
    }
    if (opacity < 1) {
        m.opacity = opacity;
        m.blendType = BLEND_ADDITIVE;
        m.depthWrite = false;
    }
    m.update();
    return m;
}

/** Ease-out with a small overshoot, from 0 to 1. */
function popScale(t: number): number {
    const c = 1.7;
    const u = Math.min(1, Math.max(0, t)) - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
}

/**
 * Pop-up toilets (design: *Pop-up toilets*): a small pool of felt cabins, the same as the kiosks, each with its door
 * facing the camera, a green sign on the door and a light beam (they are always free). In greybox, until the model has
 * loaded: a teal box with a door and a green beacon. They pop out of the ground and sink back when their time is up.
 */
export class PopupView {
    private readonly slots: Entity[];
    private readonly assigned = new Map<number, Entity>();

    constructor(app: AppBase, cabinModel?: Asset) {
        const root = new Entity('popups');
        const cabin = material('popup-cabin', PALETTE.popup);
        const door = material('popup-door', PALETTE.popupDoor);
        const beacon = material('popup-beacon', PALETTE.beaconFree, true);
        const beam = material('popup-beam', PALETTE.beaconFree, true, BEAM.opacity);
        const beamMesh = Mesh.fromGeometry(
            app.graphicsDevice,
            new CylinderGeometry({ radius: BEAM.radius, height: BEAM.height, capSegments: 12, heightSegments: 1 })
        );
        const size = POPUP_TOILETS.footprintMetres;

        this.slots = Array.from({ length: POPUP_TOILETS.maxActive }, (_, i) => {
            const slot = new Entity(`popup-${i}`);
            const body = new Entity('popup-body');
            body.addComponent('render', { type: 'box', material: cabin, castShadows: true });
            body.setLocalScale(size, CABIN_HEIGHT, size);
            body.setLocalPosition(0, CABIN_HEIGHT / 2, 0);
            const front = new Entity('popup-door');
            front.addComponent('render', { type: 'box', material: door, castShadows: false });
            front.setLocalScale(DOOR.width, DOOR.height, DOOR.depth);
            front.setLocalPosition(0, DOOR.height / 2, size / 2 + DOOR.depth / 2);
            const light = new Entity('popup-beacon');
            light.addComponent('render', { type: 'box', material: beacon, castShadows: false });
            light.setLocalScale(BEACON.size, BEACON.height, BEACON.size);
            light.setLocalPosition(0, CABIN_HEIGHT + BEACON.height / 2, 0);
            const ray = new Entity('popup-beam');
            ray.addComponent('render', {
                meshInstances: [new MeshInstance(beamMesh, beam)],
                castShadows: false,
                receiveShadows: false
            });
            ray.setLocalPosition(0, CABIN_HEIGHT + BEACON.height + BEAM.height / 2, 0);
            if (cabinModel) {
                slot.addChild(
                    fittedModel(cabinModel, { width: size, height: CABIN_HEIGHT, length: size }, 'popup-cabin')
                );
                const sign = new Entity('popup-sign');
                sign.addComponent('render', { type: 'cylinder', material: beacon, castShadows: false });
                sign.setLocalScale(DOOR_SIGN.diameter, DOOR_SIGN.thickness, DOOR_SIGN.diameter);
                sign.setLocalEulerAngles(90, 0, 0);
                sign.setLocalPosition(0, DOOR_SIGN.heightShare * CABIN_HEIGHT, size / 2 + DOOR_SIGN.thickness / 2);
                slot.addChild(sign);
                ray.setLocalPosition(0, CABIN_HEIGHT + BEAM.height / 2, 0);
            } else {
                slot.addChild(body);
                slot.addChild(front);
                slot.addChild(light);
            }
            slot.addChild(ray);
            slot.enabled = false;
            root.addChild(slot);
            return slot;
        });
        app.root.addChild(root);
    }

    update(game: Game): void {
        const live = new Set(game.popups.map((p) => p.id));
        for (const [id, slot] of this.assigned) {
            if (!live.has(id)) {
                slot.enabled = false;
                this.assigned.delete(id);
            }
        }
        for (const popup of game.popups) {
            let slot = this.assigned.get(popup.id);
            if (!slot) {
                slot = this.slots.find((s) => ![...this.assigned.values()].includes(s));
                if (!slot) {
                    continue;
                }
                this.assigned.set(popup.id, slot);
            }
            const age = POPUP_TOILETS.lifetimeSeconds - popup.secondsLeft;
            const scale =
                popup.secondsLeft < SINK_SECONDS ? popup.secondsLeft / SINK_SECONDS : popScale(age / POP_IN_SECONDS);
            slot.enabled = true;
            slot.setPosition(popup.x, 0, popup.z);
            slot.setLocalScale(1, Math.max(0.01, scale), 1);
        }
    }
}
