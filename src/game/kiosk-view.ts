import { BLEND_ADDITIVE, Color, CylinderGeometry, Entity, Mesh, MeshInstance, StandardMaterial } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { City } from '../core/city/types';
import type { Game } from '../core/game';
import { MeshBuilder } from '../render/mesh-builder';
import { PALETTE } from '../render/palette';

const KIOSK_HEIGHT = 2.6;
const DOOR = { width: 1.2, height: 2, depth: 0.08 };
const BEACON = { size: 0.6, height: 0.45 };
const BEAM = { radius: 0.35, height: 10, opacity: 0.35 };
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
    readonly door: Entity;
    readonly beacon: Entity;
    readonly beam: Entity;
    /** The door's resting position, and the direction along the facade it rattles in. */
    readonly rest: { x: number; z: number; alongX: number; alongZ: number };
}

/**
 * The public toilet kiosks (design: *Public toilet kiosks*): one mesh for all the cabins, and for each kiosk a door that
 * rattles while it is occupied, a beacon on the roof (green when free, red when occupied) and an upward light beam
 * while it is free. Beacons glow through emissive materials, not lights.
 */
export class KioskView {
    private readonly parts: KioskParts[];
    private readonly freeBeacon = emissiveMaterial('beacon-free', PALETTE.beaconFree);
    private readonly occupiedBeacon = emissiveMaterial('beacon-occupied', PALETTE.beaconOccupied);

    constructor(app: AppBase, city: City) {
        const root = new Entity('kiosks');
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

            const door = new Entity(`kiosk-door-${i}`);
            door.addComponent('render', { type: 'box', material: doorMaterial, castShadows: false });
            const across = spot.facing.x !== 0;
            door.setLocalScale(across ? DOOR.depth : DOOR.width, DOOR.height, across ? DOOR.width : DOOR.depth);
            const rest = {
                x: front.x + (spot.facing.x * DOOR.depth) / 2,
                z: front.z + (spot.facing.z * DOOR.depth) / 2,
                alongX: across ? 0 : 1,
                alongZ: across ? 1 : 0
            };
            door.setPosition(rest.x, DOOR.height / 2, rest.z);

            const beacon = new Entity(`kiosk-beacon-${i}`);
            beacon.addComponent('render', { type: 'box', material: this.freeBeacon, castShadows: false });
            beacon.setLocalScale(BEACON.size, BEACON.height, BEACON.size);
            beacon.setPosition(cx, KIOSK_HEIGHT + BEACON.height / 2, cz);

            const beam = new Entity(`kiosk-beam-${i}`);
            beam.addComponent('render', {
                meshInstances: [new MeshInstance(beamMesh, beamMaterial)],
                castShadows: false,
                receiveShadows: false
            });
            beam.setPosition(cx, KIOSK_HEIGHT + BEACON.height + BEAM.height / 2, cz);

            root.addChild(door);
            root.addChild(beacon);
            root.addChild(beam);
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
                DOOR.height / 2,
                part.rest.z + part.rest.alongZ * shake
            );
        });
    }
}
