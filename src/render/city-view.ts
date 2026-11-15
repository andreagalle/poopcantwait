import { ADDRESS_REPEAT, BLEND_NORMAL, Color, Entity, MeshInstance, StandardMaterial } from 'playcanvas';
import type { AppBase, Asset, Texture } from 'playcanvas';

import { CAMERA, CITY } from '../config/tuning';
import type { NavGrid } from '../core/city/navgrid';
import { roofOf } from '../core/city/roofs';
import { sidewalksOf } from '../core/city/sidewalks';
import type { Building, City, Rect, Side } from '../core/city/types';
import type { Markings } from '../core/traffic/markings';

import { addFacades, PLAIN_WALL_UV } from './facades';
import { MeshBuilder } from './mesh-builder';
import { PALETTE } from './palette';
import { addRoof } from './roofs';

/** Parkland and river drawn beyond the city border so the camera never sees the void, in metres. */
const EDGE_EXTENT = 90;
const RIVERBANK_WIDTH = 6;
const RIVER_WIDTH = 40;
const HEDGE_HEIGHT = 1.1;
const RAILING_HEIGHT = 0.9;
const FOUNTAIN = { rimHeight: 0.6, waterInset: 0.4, columnRadius: 0.35, columnHeight: 1.8 };
/**
 * Roads draw at slightly different heights so the wider class wins where two of them cross. The steps are a few
 * centimetres, enough to avoid depth fighting at the farthest camera distance.
 */
const ROAD_LIFT: Record<string, number> = { alley: 0.02, street: 0.03, avenue: 0.04, boulevard: 0.05 };
const OPEN_SPACE_LIFT = 0.02;
/** White paint lies just above the widest road; sidewalks stand a kerb's height above the road. */
const PAINT_LIFT = 0.056;
const SIDEWALK_HEIGHT = 0.1;
/** The felt tile repeats every this many metres on the ground. */
const FELT_METRES = 3;
const EDGE_DROP = { parkland: -0.15, riverbank: -0.1, river: -0.05 };

const tint = (c: Color, t: number): Color => new Color(c.r * t, c.g * t, c.b * t, c.a);

function vertexColorMaterial(name: string, opacity = 1, map?: Texture): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.diffuse.set(1, 1, 1);
    material.diffuseVertexColor = true;
    if (map) {
        // A felt tile, tinted by the vertex colours
        material.diffuseMap = map;
    }
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

function addGround(city: City, markings: Markings): MeshBuilder {
    const half = city.halfSize;
    const far = half + EDGE_EXTENT;
    const ground = new MeshBuilder({ worldUvMetres: FELT_METRES });
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
    for (const { rect: r } of sidewalksOf(city)) {
        ground.addBox(r.x0, 0, r.z0, r.x1, SIDEWALK_HEIGHT, r.z1, PALETTE.kerb, PALETTE.sidewalk);
    }
    for (const r of [...markings.zebras, ...markings.stopLines, ...markings.dashes]) {
        ground.addGroundRect(r.x0, r.z0, r.x1, r.z1, PAINT_LIFT, PALETTE.roadPaint);
    }
    return ground;
}

function addBuilding(mesh: MeshBuilder, b: Building, index: number, nav: NavGrid, atlas: boolean): void {
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
            b.height + CITY.clockTowerSpireMetres,
            PALETTE.clockTowerRoof,
            4,
            Math.atan2(r.z1 - r.z0, r.x1 - r.x0)
        );
        return;
    }
    const color = PALETTE.buildings[b.colorIndex % PALETTE.buildings.length];
    const roof = tint(color, PALETTE.roofTint);
    if (atlas) {
        addFacades(mesh, b, index, nav, color);
        addRoof(mesh, b, index, roofOf(b, index), color, roof);
    } else {
        mesh.addBox(r.x0, 0, r.z0, r.x1, b.height, r.z1, color, roof);
    }
}

/**
 * The small static solids: the fountain, and the hedge and railing along the border (kiosks, trees and the street
 * furniture have their own views).
 */
function addSolids(city: City): MeshBuilder {
    const solids = new MeshBuilder({ worldUvMetres: FELT_METRES });

    const f = city.plaza.fountain;
    solids.addCylinder(f.x, f.z, f.radius, 0, FOUNTAIN.rimHeight, PALETTE.fountainStone, 24);
    solids.addCylinder(f.x, f.z, f.radius - FOUNTAIN.waterInset, 0, FOUNTAIN.rimHeight + 0.02, PALETTE.water, 24);
    solids.addCylinder(f.x, f.z, FOUNTAIN.columnRadius, 0, FOUNTAIN.columnHeight, PALETTE.fountainStone, 10);

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
 * (fountain, border), and the buildings split in two meshes, opaque and faded, so the buildings between
 * the camera and Benny can turn see-through (design: *Camera*). Three or four draw calls, plus the shadow pass.
 */
export class CityView {
    readonly root: Entity;
    private readonly app: AppBase;
    private readonly city: City;
    private readonly buildings: Entity;
    private readonly faded: Entity;
    private readonly opaqueMaterial: StandardMaterial;
    private readonly buildingMaterial: StandardMaterial;
    private readonly fadedMaterial: StandardMaterial;
    private fadedKey = '';

    /** Each building's geometry, made once: the opaque and faded meshes are put together from these. */
    private readonly pieces: MeshBuilder[];

    constructor(app: AppBase, city: City, markings: Markings, facades?: Asset, felt?: Asset) {
        this.app = app;
        this.city = city;
        const repeat = (asset?: Asset): Texture | undefined => {
            const texture = asset?.resource as Texture | undefined;
            if (texture) {
                texture.addressU = ADDRESS_REPEAT;
                texture.addressV = ADDRESS_REPEAT;
                texture.anisotropy = 4;
            }
            return texture;
        };
        const atlas = facades?.resource as Texture | undefined;
        if (atlas) {
            atlas.anisotropy = 4;
        }
        const tile = atlas;
        this.pieces = city.buildings.map((b, i) => {
            const piece = new MeshBuilder({ plainUv: PLAIN_WALL_UV });
            addBuilding(piece, b, i, city.nav, atlas !== undefined);
            return piece;
        });
        this.opaqueMaterial = vertexColorMaterial('city-ground', 1, repeat(felt));
        this.buildingMaterial = vertexColorMaterial('city-buildings', 1, tile);
        this.fadedMaterial = vertexColorMaterial('city-faded', CAMERA.buildingFadeOpacity, tile);
        this.root = new Entity('city');
        this.root.addChild(layer(app, 'city-ground', addGround(city, markings), this.opaqueMaterial, false));
        this.root.addChild(layer(app, 'city-solids', addSolids(city), this.opaqueMaterial, true));
        this.buildings = layer(
            app,
            'city-buildings',
            this.buildingMesh(() => true),
            this.buildingMaterial,
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
        const mesh = new MeshBuilder({ plainUv: PLAIN_WALL_UV });
        this.pieces.forEach((piece, i) => {
            if (include(i)) {
                mesh.append(piece);
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
                ? [new MeshInstance(this.buildingMesh((i) => !faded.has(i)).build(device), this.buildingMaterial)]
                : [];
        this.faded.enabled = faded.size > 0;
        this.faded.render!.meshInstances =
            faded.size > 0
                ? [new MeshInstance(this.buildingMesh((i) => faded.has(i)).build(device), this.fadedMaterial)]
                : [];
    }
}
