import { BLEND_ADDITIVE, Color, CylinderGeometry, Entity, Mesh, MeshInstance, StandardMaterial } from 'playcanvas';
import type { AppBase, Asset } from 'playcanvas';

import type { City } from '../core/city/types';
import type { Game } from '../core/game';
import { MeshBuilder } from '../render/mesh-builder';
import { PALETTE } from '../render/palette';

import { fittedModel } from './fit-model';

const KIOSK_HEIGHT = 2.6;
const DOOR = { width: 1.2, height: 2, depth: 0.08 };
const BEACON = { size: 0.6, height: 0.45 };
const BEAM = { radius: 0.35, height: 10, opacity: 0.35 };
/**
 * On the felt cabin, a round sign on the door says free or occupied (green or red), like the latch indicator of a real
 * cabin: its diameter and thickness, in metres, and the height of its centre as a share of the cabin's.
 */
export const DOOR_SIGN = { diameter: 0.38, thickness: 0.05, heightShare: 0.75 };
/** The occupied door rattles: a small shake along the facade, in metres and cycles per second. */
const RATTLE = { amplitude: 0.04, frequency: 11 };

function emissiveMaterial(name: string, color: Color, opacity = 1): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.diffuse.set(0, 0, 0);
    material.emissive.copy(color);
    material.useLighting = false;
    if (opacity < 1) {
        material.opacity = opacity;
        material.blendType = BLEND_ADDITIVE;
        material.depthWrite = false;
    }
    material.update();
    return material;
}

function flatMaterial(name: string, color: Color): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.diffuse.copy(color);
    material.useMetalness = true;
    material.metalness = 0;
    material.gloss = 0.3;
    material.update();
    return material;
}

interface KioskParts {
    /** What rattles while it is occupied: the door on the greybox, the whole felt cabin. */
    readonly door: Entity;
    /** What turns green or red: the roof beacon on the greybox, the door sign on the felt cabin. */
    readonly beacon: Entity;
    readonly beam: Entity;
    /** The rattling part's resting position, and the direction along the facade it rattles in. */
    readonly rest: { x: number; y: number; z: number; alongX: number; alongZ: number };
}

/**
 * The public toilet kiosks (design: *Public toilet kiosks*): the felt cabin of the art pass, filling its notch with the
 * door to the street, a round sign on the door (green when free, red when occupied), a rattle while it is occupied and
 * an upward light beam while it is free. In greybox, until the model has loaded: one mesh for all the cabins, a door
 * that rattles and a beacon on the roof. Signs and beacons glow through emissive materials, not lights.
 */
export class KioskView {
    private readonly parts: KioskParts[];
    private readonly freeBeacon = emissiveMaterial('beacon-free', PALETTE.beaconFree);
    private readonly occupiedBeacon = emissiveMaterial('beacon-occupied', PALETTE.beaconOccupied);

    constructor(app: AppBase, city: City, cabinModel?: Asset) {
        const root = new Entity('kiosks');
        if (!cabinModel) {
            const cabins = new MeshBuilder();
            for (const spot of city.kioskSpots) {
                const r = spot.rect;
                cabins.addBox(r.x0, 0, r.z0, r.x1, KIOSK_HEIGHT, r.z1, PALETTE.kiosk);
            }
            const cabinsEntity = new Entity('kiosk-cabins');
            const cabinMaterial = flatMaterial('kiosk-cabin', new Color(1, 1, 1));
            cabinMaterial.diffuseVertexColor = true;
            cabinMaterial.update();
            cabinsEntity.addComponent('render', {
                meshInstances: [new MeshInstance(cabins.build(app.graphicsDevice), cabinMaterial)],
                castShadows: true,
                receiveShadows: true
            });
            root.addChild(cabinsEntity);
        }

        const doorMaterial = flatMaterial('kiosk-door', PALETTE.kioskDoor);
        const beamMaterial = emissiveMaterial('kiosk-beam', PALETTE.beaconFree, BEAM.opacity);
        const beamMesh = Mesh.fromGeometry(
            app.graphicsDevice,
            new CylinderGeometry({ radius: BEAM.radius, height: BEAM.height, capSegments: 12, heightSegments: 1 })
        );

        this.parts = city.kioskSpots.map((spot, i) => {
            const r = spot.rect;
            const cx = (r.x0 + r.x1) / 2;
            const cz = (r.z0 + r.z1) / 2;
            const front = { x: cx + (spot.facing.x * (r.x1 - r.x0)) / 2, z: cz + (spot.facing.z * (r.z1 - r.z0)) / 2 };
            const across = spot.facing.x !== 0;

            const beam = new Entity(`kiosk-beam-${i}`);
            beam.addComponent('render', {
                meshInstances: [new MeshInstance(beamMesh, beamMaterial)],
                castShadows: false,
                receiveShadows: false
            });
            beam.setPosition(cx, KIOSK_HEIGHT + BEACON.height + BEAM.height / 2, cz);
            root.addChild(beam);

            if (cabinModel) {
                const yaw = (Math.atan2(spot.facing.x, spot.facing.z) * 180) / Math.PI;
                // Kiosks face along an axis, so the turn is a multiple of 90 degrees
                const cabin = fittedModel(
                    cabinModel,
                    { width: r.x1 - r.x0, height: KIOSK_HEIGHT, length: r.z1 - r.z0, yawDegrees: Math.round(yaw) },
                    `kiosk-cabin-${i}`
                );
                cabin.setPosition(cx, 0, cz);
                // The sign sits on the door, its face to the street
                const holder = new Entity(`kiosk-sign-holder-${i}`);
                holder.setPosition(
                    front.x + (spot.facing.x * DOOR_SIGN.thickness) / 2,
                    DOOR_SIGN.heightShare * KIOSK_HEIGHT,
                    front.z + (spot.facing.z * DOOR_SIGN.thickness) / 2
                );
                holder.setEulerAngles(0, yaw, 0);
                const sign = new Entity(`kiosk-sign-${i}`);
                sign.addComponent('render', { type: 'cylinder', material: this.freeBeacon, castShadows: false });
                sign.setLocalScale(DOOR_SIGN.diameter, DOOR_SIGN.thickness, DOOR_SIGN.diameter);
                sign.setLocalEulerAngles(90, 0, 0);
                holder.addChild(sign);
                root.addChild(cabin);
                root.addChild(holder);
                const rest = { x: cx, y: 0, z: cz, alongX: across ? 0 : 1, alongZ: across ? 1 : 0 };
                return { door: cabin, beacon: sign, beam, rest };
            }

            const door = new Entity(`kiosk-door-${i}`);
            door.addComponent('render', { type: 'box', material: doorMaterial, castShadows: false });
            door.setLocalScale(across ? DOOR.depth : DOOR.width, DOOR.height, across ? DOOR.width : DOOR.depth);
            const rest = {
                x: front.x + (spot.facing.x * DOOR.depth) / 2,
                y: DOOR.height / 2,
                z: front.z + (spot.facing.z * DOOR.depth) / 2,
                alongX: across ? 0 : 1,
                alongZ: across ? 1 : 0
            };
            door.setPosition(rest.x, rest.y, rest.z);

            const beacon = new Entity(`kiosk-beacon-${i}`);
            beacon.addComponent('render', { type: 'box', material: this.freeBeacon, castShadows: false });
            beacon.setLocalScale(BEACON.size, BEACON.height, BEACON.size);
            beacon.setPosition(cx, KIOSK_HEIGHT + BEACON.height / 2, cz);

            root.addChild(door);
            root.addChild(beacon);
            return { door, beacon, beam, rest };
        });
        app.root.addChild(root);
    }

    update(game: Game): void {
        game.kiosks.forEach((kiosk, i) => {
            const part = this.parts[i];
            const free = kiosk.status === 'free';
            const material = free ? this.freeBeacon : this.occupiedBeacon;
            const instance = part.beacon.render!.meshInstances[0];
            if (instance.material !== material) {
                instance.material = material;
            }
            part.beam.enabled = free;
            const shake = free
                ? 0
                : RATTLE.amplitude * Math.sin(2 * Math.PI * RATTLE.frequency * (game.time + i * 0.37));
            part.door.setPosition(
                part.rest.x + part.rest.alongX * shake,
                part.rest.y,
                part.rest.z + part.rest.alongZ * shake
            );
        });
    }
}
