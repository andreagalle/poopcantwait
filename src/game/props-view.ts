import {
    Color,
    Entity,
    Mat4,
    MeshInstance,
    Quat,
    StandardMaterial,
    Vec3,
    VertexBuffer,
    VertexFormat
} from 'playcanvas';
import type { AppBase, Asset, ContainerResource, Material, Mesh, RenderComponent } from 'playcanvas';

import type { AssetId } from '../assets/registry';
import { CITY } from '../config/tuning';
import type { PropKind } from '../core/city/props';
import type { City } from '../core/city/types';
import { MeshBuilder } from '../render/mesh-builder';
import { PALETTE } from '../render/palette';

/** The felt model of each kind of street furniture but the trees (design: *Street props*). */
export const PROP_MODELS = {
    lamp: 'prop.lamp',
    bench: 'prop.bench',
    hydrant: 'prop.hydrant',
    shelter: 'street.bus-shelter'
} as const satisfies Record<Exclude<PropKind, 'tree'>, AssetId>;

/** The trees: seven kinds, each its own felt model. */
export type TreeSpecies = 'plane' | 'poplar' | 'fir' | 'willow' | 'cherry' | 'maple' | 'lime';
export const TREE_MODELS = {
    plane: 'tree.plane',
    poplar: 'tree.poplar',
    fir: 'tree.fir',
    willow: 'tree.willow',
    cherry: 'tree.cherry',
    maple: 'tree.maple',
    lime: 'tree.lime'
} as const satisfies Record<TreeSpecies, AssetId>;

/**
 * The size each piece is drawn at, in metres, once turned to face the road: across, up, and out from the facade. A
 * `uniform` piece keeps its proportions: it is as tall as `height` unless that would make it wider than `width`.
 */
interface Size {
    readonly width: number;
    readonly height: number;
    readonly length: number;
    readonly uniform?: boolean;
}

/**
 * Trees along a boulevard keep their crowns clear of the buses: no wider than the canopy the city leaves them. The tall,
 * narrow kinds (lime, poplar) grow tallest there, a smaller maple now and then; in turn along each side.
 */
const canopy = 2 * CITY.streetProps.kinds.tree.canopyRadiusMetres;
const STREET_TREES: readonly { species: TreeSpecies; height: number }[] = [
    { species: 'lime', height: 7 },
    { species: 'poplar', height: 8 },
    { species: 'lime', height: 7 },
    { species: 'maple', height: 5 }
];
/** The park's trees are older and bigger, every kind of them: their trunks are 0.8 m wide in the game. */
const PARK_TREES: readonly { species: TreeSpecies; height: number }[] = [
    { species: 'plane', height: 8 },
    { species: 'willow', height: 7 },
    { species: 'fir', height: 8.5 },
    { species: 'cherry', height: 6 },
    { species: 'maple', height: 7 },
    { species: 'lime', height: 8 },
    { species: 'poplar', height: 10 }
];
const PARK_CANOPY_METRES = 7;

const SIZE: Record<Exclude<PropKind, 'tree'>, Size> = {
    lamp: { width: 0.9, height: 3.6, length: 0.9 },
    hydrant: { width: 0.62, height: 0.85, length: 0.62 },
    bench: {
        width: CITY.streetProps.kinds.bench.lengthMetres,
        height: 0.95,
        length: CITY.streetProps.kinds.bench.depthMetres
    },
    shelter: {
        width: CITY.streetProps.kinds.shelter.lengthMetres,
        height: 2.6,
        length: CITY.streetProps.kinds.shelter.depthMetres
    }
};
interface Placement {
    readonly x: number;
    readonly z: number;
    /** Turn about the vertical axis, in degrees: the model's front (+z) to the way the piece faces. */
    readonly yaw: number;
    readonly size: Size;
}

/** A model's one mesh, its material, and how to stand it: centred over the origin, its lowest point at y = 0. */
export interface Piece {
    readonly mesh: Mesh;
    readonly material: Material;
    readonly base: Mat4;
    readonly extents: Vec3;
}

export function pieceOf(asset: Asset | undefined): Piece | null {
    if (!asset) {
        return null;
    }
    const entity = (asset.resource as ContainerResource).instantiateRenderEntity();
    const render = entity.findComponents('render')[0] as RenderComponent | undefined;
    const instance = render?.meshInstances[0];
    if (!instance?.material || !instance.mesh) {
        return null;
    }
    const box = instance.aabb;
    const { center, halfExtents } = box;
    const lift = new Mat4().setTranslate(-center.x, -(center.y - halfExtents.y), -center.z);
    const base = new Mat4().mul2(lift, instance.node.getWorldTransform());
    return {
        mesh: instance.mesh,
        material: instance.material,
        base,
        extents: new Vec3(2 * halfExtents.x, 2 * halfExtents.y, 2 * halfExtents.z)
    };
}

function greyboxMaterial(): StandardMaterial {
    const material = new StandardMaterial();
    material.name = 'props-greybox';
    material.diffuse.set(1, 1, 1);
    material.diffuseVertexColor = true;
    material.useMetalness = true;
    material.metalness = 0;
    material.gloss = 0.2;
    material.update();
    return material;
}

/** The greybox stand-in of a piece, until its model has loaded or should it fail to. */
function addGreybox(mesh: MeshBuilder, kind: PropKind, p: Placement): void {
    const { x, z, size } = p;
    switch (kind) {
        case 'tree':
            mesh.addCylinder(x, z, size.width * 0.08, 0, size.height * 0.36, PALETTE.treeTrunk, 6);
            mesh.addCone(x, z, size.width / 2, size.height * 0.27, size.height, PALETTE.treeCanopy, 8);
            return;
        case 'lamp':
            mesh.addCylinder(x, z, 0.1, 0, size.height * 0.85, PALETTE.hedge, 6);
            mesh.addCylinder(x, z, size.width / 2, size.height * 0.85, size.height, new Color(1, 0.95, 0.8), 8);
            return;
        case 'hydrant':
            mesh.addCylinder(x, z, size.width / 2, 0, size.height, new Color(0.85, 0.2, 0.18), 8);
            return;
        case 'bench':
        case 'shelter': {
            const across = Math.abs(Math.round(p.yaw / 90)) % 2 === 1;
            const hx = (across ? size.length : size.width) / 2;
            const hz = (across ? size.width : size.length) / 2;
            const height = kind === 'bench' ? size.height * 0.5 : size.height;
            mesh.addBox(x - hx, 0, z - hz, x + hx, height, z + hz, new Color(0.75, 0.5, 0.25));
        }
    }
}

/** The scale that stretches a model of these extents to a size. */
function scaleFor(size: Size, extents: Vec3, out: Vec3): Vec3 {
    if (size.uniform) {
        const s = Math.min(size.height / extents.y, size.width / Math.max(extents.x, extents.z));
        return out.set(s, s, s);
    }
    return out.set(size.width / extents.x, size.height / extents.y, size.length / extents.z);
}

/** The pieces drawn from one model: its kind of furniture, for the greybox stand-in, and where each stands. */
interface Group {
    readonly kind: PropKind;
    readonly list: Placement[];
}

/**
 * The street furniture and the park's trees (design: *Street props*): each model drawn in one call, with hardware
 * instancing; a model that did not load is drawn in greybox, all such pieces in one mesh.
 */
export class PropsView {
    readonly root = new Entity('props');

    constructor(app: AppBase, city: City, models: ReadonlyMap<AssetId, Asset>) {
        const groups = new Map<AssetId, Group>();
        const add = (id: AssetId, kind: PropKind, placement: Placement): void => {
            const group = groups.get(id) ?? { kind, list: [] };
            group.list.push(placement);
            groups.set(id, group);
        };
        let streetTrees = 0;
        for (const p of city.props) {
            const yaw = (Math.atan2(p.facing.x, p.facing.z) * 180) / Math.PI;
            if (p.kind === 'tree') {
                const { species, height } = STREET_TREES[streetTrees++ % STREET_TREES.length];
                // Trees turn any way, so they do not look stamped
                const size = { width: canopy, height, length: canopy, uniform: true };
                add(TREE_MODELS[species], 'tree', { x: p.x, z: p.z, yaw: (streetTrees * 97) % 360, size });
            } else {
                add(PROP_MODELS[p.kind], p.kind, { x: p.x, z: p.z, yaw, size: SIZE[p.kind] });
            }
        }
        city.park.trees.forEach((t, i) => {
            const { species, height } = PARK_TREES[(i * 3) % PARK_TREES.length];
            const size = { width: PARK_CANOPY_METRES, height, length: PARK_CANOPY_METRES, uniform: true };
            add(TREE_MODELS[species], 'tree', { x: t.x, z: t.z, yaw: (i * 137) % 360, size });
        });

        const greybox = new MeshBuilder();
        const device = app.graphicsDevice;
        const format = VertexFormat.getDefaultInstancingFormat(device);
        const turn = new Quat();
        const scale = new Vec3();
        const position = new Vec3();
        const trs = new Mat4();
        const world = new Mat4();
        for (const [id, { kind, list }] of groups) {
            const piece = pieceOf(models.get(id));
            if (!piece) {
                list.forEach((p) => addGreybox(greybox, kind, p));
                continue;
            }
            const matrices = new Float32Array(list.length * 16);
            list.forEach((p, i) => {
                position.set(p.x, 0, p.z);
                turn.setFromEulerAngles(0, p.yaw, 0);
                trs.setTRS(position, turn, scaleFor(p.size, piece.extents, scale));
                world.mul2(trs, piece.base);
                matrices.set(world.data, i * 16);
            });
            const instance = new MeshInstance(piece.mesh, piece.material);
            instance.setInstancing(new VertexBuffer(device, format, list.length, { data: matrices }));
            const entity = new Entity(`props-${id}`);
            entity.addComponent('render', {
                meshInstances: [instance],
                castShadows: kind === 'tree' || kind === 'lamp',
                receiveShadows: true
            });
            this.root.addChild(entity);
        }
        if (greybox.vertexCount > 0) {
            const entity = new Entity('props-greybox');
            entity.addComponent('render', {
                meshInstances: [new MeshInstance(greybox.build(device), greyboxMaterial())],
                castShadows: true,
                receiveShadows: true
            });
            this.root.addChild(entity);
        }
        app.root.addChild(this.root);
    }
}
