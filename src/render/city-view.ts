import { ADDRESS_REPEAT, BLEND_NORMAL, Color, Entity, MeshInstance, StandardMaterial } from 'playcanvas';
import type { AppBase, Asset, Texture } from 'playcanvas';

import { CAMERA, CITY } from '../config/tuning';
import type { NavGrid } from '../core/city/navgrid';
import { roofOf } from '../core/city/roofs';
import { sidewalksOf } from '../core/city/sidewalks';
import type { Building, City, Rect, Side } from '../core/city/types';
import type { Markings } from '../core/traffic/markings';

import { addFacades, PLAIN_WALL_UV } from './facades';
import { MeshBuilder, meshFromArrays } from './mesh-builder';
import type { MeshArrays } from './mesh-builder';
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
/** The buildings are drawn in square blocks of the city, this many to a side: a fade rebuilds only the blocks it touches. */
const BLOCKS_PER_SIDE = 4;

export class CityView {
    readonly root: Entity;
    private readonly app: AppBase;
    private readonly faded: Entity;
    private readonly opaqueMaterial: StandardMaterial;
    private readonly buildingMaterial: StandardMaterial;
    private readonly fadedMaterial: StandardMaterial;
    private fadedSet = new Set<number>();

    /** Each building's geometry, made once, as typed arrays. */
    private readonly pieces: MeshArrays[];
    /** The block each building is drawn in, each block's buildings and its entity. */
    private readonly blockOf: number[];
    private readonly blockMembers: number[][];
    private readonly blocks: Entity[];

    constructor(app: AppBase, city: City, markings: Markings, facades?: Asset, felt?: Asset) {
        this.app = app;
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
        this.pieces = city.buildings.map((b, i) => {
            const piece = new MeshBuilder({ plainUv: PLAIN_WALL_UV });
            addBuilding(piece, b, i, city.nav, atlas !== undefined);
            return piece.toArrays();
        });
        this.opaqueMaterial = vertexColorMaterial('city-ground', 1, repeat(felt));
        this.buildingMaterial = vertexColorMaterial('city-buildings', 1, atlas);
        this.fadedMaterial = vertexColorMaterial('city-faded', CAMERA.buildingFadeOpacity, atlas);
        this.root = new Entity('city');
        this.root.addChild(layer(app, 'city-ground', addGround(city, markings), this.opaqueMaterial, false));
        this.root.addChild(layer(app, 'city-solids', addSolids(city), this.opaqueMaterial, true));

        // The buildings, block by block, by where their centre stands
        const size = (2 * city.halfSize) / BLOCKS_PER_SIDE;
        const cell = (v: number): number =>
            Math.min(BLOCKS_PER_SIDE - 1, Math.max(0, Math.floor((v + city.halfSize) / size)));
        this.blockOf = city.buildings.map(
            ({ rect: r }) => cell((r.z0 + r.z1) / 2) * BLOCKS_PER_SIDE + cell((r.x0 + r.x1) / 2)
        );
        this.blockMembers = Array.from({ length: BLOCKS_PER_SIDE * BLOCKS_PER_SIDE }, () => []);
        this.blockOf.forEach((block, i) => this.blockMembers[block].push(i));
        this.blocks = this.blockMembers.map((members, block) => {
            const entity = new Entity(`city-buildings-${block}`);
            entity.addComponent('render', { meshInstances: [], castShadows: true, receiveShadows: true });
            this.root.addChild(entity);
            this.fillBlock(entity, members);
            return entity;
        });
        this.faded = new Entity('city-buildings-faded');
        this.faded.addComponent('render', { meshInstances: [], castShadows: true, receiveShadows: true });
        this.faded.enabled = false;
        this.root.addChild(this.faded);
        app.root.addChild(this.root);
    }

    /** Swaps a render component's mesh instances for new ones, freeing the old meshes on the GPU. */
    private static swap(entity: Entity, instances: MeshInstance[]): void {
        const old = entity.render!.meshInstances;
        entity.render!.meshInstances = instances;
        for (const instance of old) {
            instance.destroy();
        }
    }

    /** Draws a block's buildings into its entity, all but the faded ones. */
    private fillBlock(entity: Entity, members: readonly number[]): void {
        const shown = members.filter((i) => !this.fadedSet.has(i)).map((i) => this.pieces[i]);
        const device = this.app.graphicsDevice;
        CityView.swap(
            entity,
            shown.length > 0 ? [new MeshInstance(meshFromArrays(device, shown), this.buildingMaterial)] : []
        );
    }

    /**
     * Fades the buildings with these indices and makes every other one opaque again. Only the blocks of the buildings
     * whose fade changed are rebuilt, and the faded ones are drawn in one small mesh of their own.
     */
    setFaded(indices: readonly number[]): void {
        const next = new Set(indices);
        const changed = [
            ...indices.filter((i) => !this.fadedSet.has(i)),
            ...[...this.fadedSet].filter((i) => !next.has(i))
        ];
        if (changed.length === 0) {
            return;
        }
        this.fadedSet = next;
        for (const block of new Set(changed.map((i) => this.blockOf[i]))) {
            this.fillBlock(this.blocks[block], this.blockMembers[block]);
        }
        const faded = indices.map((i) => this.pieces[i]);
        CityView.swap(
            this.faded,
            faded.length > 0
                ? [new MeshInstance(meshFromArrays(this.app.graphicsDevice, faded), this.fadedMaterial)]
                : []
        );
        this.faded.enabled = faded.length > 0;
    }
}
