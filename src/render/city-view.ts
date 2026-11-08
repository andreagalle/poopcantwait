import { BLEND_NORMAL, Color, Entity, MeshInstance, StandardMaterial } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { CAMERA } from '../config/tuning';
import type { Building, City, Rect, Side } from '../core/city/types';

import { MeshBuilder } from './mesh-builder';
import { PALETTE } from './palette';

/** Parkland and river drawn beyond the city border so the camera never sees the void, in metres. */
const EDGE_EXTENT = 90;
const RIVERBANK_WIDTH = 6;
const RIVER_WIDTH = 40;
const HEDGE_HEIGHT = 1.1;
const RAILING_HEIGHT = 0.9;
const KIOSK_HEIGHT = 2.6;
const KIOSK_DOOR = { width: 1.2, height: 2, depth: 0.06 };
const TREE = { trunkRadius: 0.3, trunkHeight: 1.6, canopyRadius: 2.1, canopyBase: 1.2, canopyTop: 5.6 };
const FOUNTAIN = { rimHeight: 0.6, waterInset: 0.4, columnRadius: 0.35, columnHeight: 1.8 };
const CLOCK_TOWER_ROOF_HEIGHT = 5;
/**
 * Roads draw at slightly different heights so the wider class wins where two of them cross. The steps are a few
 * centimetres, enough to avoid depth fighting at the farthest camera distance.
 */
const ROAD_LIFT: Record<string, number> = { alley: 0.02, street: 0.03, avenue: 0.04, boulevard: 0.05 };
const OPEN_SPACE_LIFT = 0.02;
const EDGE_DROP = { parkland: -0.15, riverbank: -0.1, river: -0.05 };

const tint = (c: Color, t: number): Color => new Color(c.r * t, c.g * t, c.b * t, c.a);

function vertexColorMaterial(name: string, opacity = 1): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.diffuse.set(1, 1, 1);
    material.diffuseVertexColor = true;
    material.useMetalness = true;
    material.metalness = 0;
    material.gloss = 0.2;
    if (opacity < 1) {
        material.opacity = opacity;
        material.blendType = BLEND_NORMAL;
        material.depthWrite = false;
    }
    material.update();
    return material;
}

/** The strip of land beyond one side of the city, from `inner` to `outer` metres past the border. */
function beyond(side: Side, half: number, inner: number, outer: number): Rect {
    const far = half + EDGE_EXTENT;
    switch (side) {
        case 'north':
            return { x0: -far, z0: -half - outer, x1: far, z1: -half - inner };
        case 'south':
            return { x0: -far, z0: half + inner, x1: far, z1: half + outer };
        case 'west':
            return { x0: -half - outer, z0: -far, x1: -half - inner, z1: far };
        case 'east':
            return { x0: half + inner, z0: -far, x1: half + outer, z1: far };
    }
}

function addGround(city: City): MeshBuilder {
    const half = city.halfSize;
    const far = half + EDGE_EXTENT;
    const ground = new MeshBuilder();
    ground.addGroundRect(-far, -far, far, far, EDGE_DROP.parkland, PALETTE.parkland);
    for (const edge of city.edges.filter((e) => e.kind === 'river')) {
        const bank = beyond(edge.side, half, 0, RIVERBANK_WIDTH);
        ground.addGroundRect(bank.x0, bank.z0, bank.x1, bank.z1, EDGE_DROP.riverbank, PALETTE.riverbank);
    }
    for (const edge of city.edges.filter((e) => e.kind === 'river')) {
        const river = beyond(edge.side, half, RIVERBANK_WIDTH, RIVERBANK_WIDTH + RIVER_WIDTH);
        ground.addGroundRect(river.x0, river.z0, river.x1, river.z1, EDGE_DROP.river, PALETTE.river);
    }
    ground.addGroundRect(-half, -half, half, half, 0, PALETTE.cityGround);
    for (const road of [...city.alleys, ...city.roads]) {
        const r = road.rect;
        ground.addGroundRect(r.x0, r.z0, r.x1, r.z1, ROAD_LIFT[road.streetClass], PALETTE.roads[road.streetClass]);
    }
    const plaza = city.plaza.rect;
    ground.addGroundRect(plaza.x0, plaza.z0, plaza.x1, plaza.z1, OPEN_SPACE_LIFT, PALETTE.plaza);
    const park = city.park.rect;
    ground.addGroundRect(park.x0, park.z0, park.x1, park.z1, OPEN_SPACE_LIFT, PALETTE.grass);
    return ground;
}

function addBuilding(mesh: MeshBuilder, b: Building): void {
    const r = b.rect;
    if (b.landmark === 'clockTower') {
        mesh.addBox(r.x0, 0, r.z0, r.x1, b.height, r.z1, PALETTE.clockTower);
        const cx = (r.x0 + r.x1) / 2;
        const cz = (r.z0 + r.z1) / 2;
        const radius = Math.hypot(r.x1 - r.x0, r.z1 - r.z0) / 2;
        mesh.addCone(
            cx,
            cz,
            radius,
            b.height,
            b.height + CLOCK_TOWER_ROOF_HEIGHT,
            PALETTE.clockTowerRoof,
            4,
            Math.atan2(r.z1 - r.z0, r.x1 - r.x0)
        );
        return;
    }
    const color = PALETTE.buildings[b.colorIndex % PALETTE.buildings.length];
    mesh.addBox(r.x0, 0, r.z0, r.x1, b.height, r.z1, color, tint(color, PALETTE.roofTint));
}

/** Everything solid except the buildings: kiosks, fountain, trees, and the hedge and railing along the border. */
function addSolids(city: City): MeshBuilder {
    const solids = new MeshBuilder();

    for (const k of city.kioskSpots) {
        const r = k.rect;
        solids.addBox(r.x0, 0, r.z0, r.x1, KIOSK_HEIGHT, r.z1, PALETTE.kiosk);
        // The door, a thin slab on the side facing the road
        const cx = (r.x0 + r.x1) / 2;
        const cz = (r.z0 + r.z1) / 2;
        const half = KIOSK_DOOR.width / 2;
        const fx = k.facing.x !== 0 ? (k.facing.x > 0 ? r.x1 : r.x0) : 0;
        const fz = k.facing.z !== 0 ? (k.facing.z > 0 ? r.z1 : r.z0) : 0;
        const d = KIOSK_DOOR.depth;
        if (k.facing.x !== 0) {
            const x0 = k.facing.x > 0 ? fx : fx - d;
            solids.addBox(x0, 0, cz - half, x0 + d, KIOSK_DOOR.height, cz + half, PALETTE.kioskDoor);
        } else {
            const z0 = k.facing.z > 0 ? fz : fz - d;
            solids.addBox(cx - half, 0, z0, cx + half, KIOSK_DOOR.height, z0 + d, PALETTE.kioskDoor);
        }
    }

    const f = city.plaza.fountain;
    solids.addCylinder(f.x, f.z, f.radius, 0, FOUNTAIN.rimHeight, PALETTE.fountainStone, 24);
    solids.addCylinder(f.x, f.z, f.radius - FOUNTAIN.waterInset, 0, FOUNTAIN.rimHeight + 0.02, PALETTE.water, 24);
    solids.addCylinder(f.x, f.z, FOUNTAIN.columnRadius, 0, FOUNTAIN.columnHeight, PALETTE.fountainStone, 10);

    for (const t of city.park.trees) {
        solids.addCylinder(t.x, t.z, TREE.trunkRadius, 0, TREE.trunkHeight, PALETTE.treeTrunk, 6);
        solids.addCone(t.x, t.z, TREE.canopyRadius, TREE.canopyBase, TREE.canopyTop, PALETTE.treeCanopy, 8);
    }

    // A hedge along parkland sides and a railing along the river: the city border is a wall
    const half = city.halfSize;
    for (const edge of city.edges) {
        const river = edge.kind === 'river';
        const t = river ? 0.3 : 1;
        const height = river ? RAILING_HEIGHT : HEDGE_HEIGHT;
        const color = river ? PALETTE.railing : PALETTE.hedge;
        const box: Record<Side, Rect> = {
            north: { x0: -half - t, z0: -half - t, x1: half + t, z1: -half },
            south: { x0: -half - t, z0: half, x1: half + t, z1: half + t },
            west: { x0: -half - t, z0: -half - t, x1: -half, z1: half + t },
            east: { x0: half, z0: -half - t, x1: half + t, z1: half + t }
        };
        const r = box[edge.side];
        solids.addBox(r.x0, 0, r.z0, r.x1, height, r.z1, color);
    }
    return solids;
}

function layer(app: AppBase, name: string, mesh: MeshBuilder, material: StandardMaterial, castShadows: boolean) {
    const entity = new Entity(name);
    entity.addComponent('render', {
        meshInstances: [new MeshInstance(mesh.build(app.graphicsDevice), material)],
        castShadows,
        receiveShadows: true
    });
    return entity;
}

/**
 * The greybox city: one mesh for the ground (edge, roads coloured by class, plaza, park), one for the small solids
 * (kiosks, fountain, trees, border), and the buildings split in two meshes, opaque and faded, so the buildings between
 * the camera and Benny can turn see-through (design: *Camera*). Three or four draw calls, plus the shadow pass.
 */
export class CityView {
    readonly root: Entity;
    private readonly app: AppBase;
    private readonly city: City;
    private readonly buildings: Entity;
    private readonly faded: Entity;
    private readonly opaqueMaterial = vertexColorMaterial('city-greybox');
    private readonly fadedMaterial = vertexColorMaterial('city-faded', CAMERA.buildingFadeOpacity);
    private fadedKey = '';

    constructor(app: AppBase, city: City) {
        this.app = app;
        this.city = city;
        this.root = new Entity('city');
        this.root.addChild(layer(app, 'city-ground', addGround(city), this.opaqueMaterial, false));
        this.root.addChild(layer(app, 'city-solids', addSolids(city), this.opaqueMaterial, true));
        this.buildings = layer(
            app,
            'city-buildings',
            this.buildingMesh(() => true),
            this.opaqueMaterial,
            true
        );
        this.faded = new Entity('city-buildings-faded');
        this.faded.addComponent('render', { meshInstances: [], castShadows: true, receiveShadows: true });
        this.faded.enabled = false;
        this.root.addChild(this.buildings);
        this.root.addChild(this.faded);
        app.root.addChild(this.root);
    }

    private buildingMesh(include: (index: number) => boolean): MeshBuilder {
        const mesh = new MeshBuilder();
        this.city.buildings.forEach((b, i) => {
            if (include(i)) {
                addBuilding(mesh, b);
            }
        });
        return mesh;
    }

    /** Fades the buildings with these indices (sorted) and makes every other one opaque again. */
    setFaded(indices: readonly number[]): void {
        const key = indices.join(',');
        if (key === this.fadedKey) {
            return;
        }
        this.fadedKey = key;
        const faded = new Set(indices);
        const device = this.app.graphicsDevice;
        this.buildings.render!.meshInstances =
            faded.size < this.city.buildings.length
                ? [new MeshInstance(this.buildingMesh((i) => !faded.has(i)).build(device), this.opaqueMaterial)]
                : [];
        this.faded.enabled = faded.size > 0;
        this.faded.render!.meshInstances =
            faded.size > 0
                ? [new MeshInstance(this.buildingMesh((i) => faded.has(i)).build(device), this.fadedMaterial)]
                : [];
    }
}
