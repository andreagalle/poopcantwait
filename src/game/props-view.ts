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

/** The felt model of each kind of street furniture (design: *Street props*). */
export const PROP_MODELS = {
    tree: 'prop.tree',
    lamp: 'prop.lamp',
    bench: 'prop.bench',
    hydrant: 'prop.hydrant'
} as const satisfies Record<PropKind, AssetId>;

/** The size each piece is drawn at, in metres, once turned to face the road: across, up, and out from the facade. */
interface Size {
    readonly width: number;
    readonly height: number;
    readonly length: number;
}

const canopy = 2 * CITY.streetProps.kinds.tree.canopyRadiusMetres;
const SIZE: Record<PropKind, Size> = {
    tree: { width: canopy, height: 4.4, length: canopy },
    lamp: { width: 0.9, height: 3.6, length: 0.9 },
    hydrant: { width: 0.62, height: 0.85, length: 0.62 },
    bench: {
        width: CITY.streetProps.kinds.bench.lengthMetres,
        height: 0.95,
        length: CITY.streetProps.kinds.bench.depthMetres
    }
};
/** The park's trees are older and bigger: their trunks are 0.8 m wide in the game. */
const PARK_TREE: Size = { width: 4.6, height: 6, length: 4.6 };

interface Placement {
    readonly x: number;
    readonly z: number;
    /** Turn about the vertical axis, in degrees: the model's front (+z) to the way the piece faces. */
    readonly yaw: number;
    readonly size: Size;
}

/** A model's one mesh, its material, and how to stand it: centred over the origin, its lowest point at y = 0. */
interface Piece {
    readonly mesh: Mesh;
    readonly material: Material;
    readonly base: Mat4;
    readonly extents: Vec3;
}

function pieceOf(asset: Asset | undefined): Piece | null {
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
        case 'bench': {
            const across = Math.abs(Math.round(p.yaw / 90)) % 2 === 1;
            const hx = (across ? size.length : size.width) / 2;
            const hz = (across ? size.width : size.length) / 2;
            mesh.addBox(x - hx, 0, z - hz, x + hx, size.height * 0.5, z + hz, new Color(0.75, 0.5, 0.25));
        }
    }
}

/**
 * The street furniture and the park's trees (design: *Street props*): each kind drawn in one call, with hardware
 * instancing, from its felt model; a kind whose model did not load is drawn in greybox, all such kinds in one mesh.
 */
export class PropsView {
    readonly root = new Entity('props');

    constructor(app: AppBase, city: City, models: ReadonlyMap<AssetId, Asset>) {
        const placements: Record<PropKind, Placement[]> = { tree: [], lamp: [], bench: [], hydrant: [] };
        for (const p of city.props) {
            const yaw = (Math.atan2(p.facing.x, p.facing.z) * 180) / Math.PI;
            placements[p.kind].push({ x: p.x, z: p.z, yaw, size: SIZE[p.kind] });
        }
        city.park.trees.forEach((t, i) => {
            // Each park tree turned its own way, so they do not look stamped
            placements.tree.push({ x: t.x, z: t.z, yaw: (i * 137) % 360, size: PARK_TREE });
        });

        const greybox = new MeshBuilder();
        const device = app.graphicsDevice;
        const format = VertexFormat.getDefaultInstancingFormat(device);
        const turn = new Quat();
        const scale = new Vec3();
        const position = new Vec3();
        const trs = new Mat4();
        const world = new Mat4();
        for (const kind of Object.keys(placements) as PropKind[]) {
            const list = placements[kind];
            const piece = pieceOf(models.get(PROP_MODELS[kind]));
            if (list.length === 0) {
                continue;
            }
            if (!piece) {
                list.forEach((p) => addGreybox(greybox, kind, p));
                continue;
            }
            const matrices = new Float32Array(list.length * 16);
            list.forEach((p, i) => {
                position.set(p.x, 0, p.z);
                turn.setFromEulerAngles(0, p.yaw, 0);
                scale.set(
                    p.size.width / piece.extents.x,
                    p.size.height / piece.extents.y,
                    p.size.length / piece.extents.z
                );
                trs.setTRS(position, turn, scale);
                world.mul2(trs, piece.base);
                matrices.set(world.data, i * 16);
            });
            const instance = new MeshInstance(piece.mesh, piece.material);
            instance.setInstancing(new VertexBuffer(device, format, list.length, { data: matrices }));
            const entity = new Entity(`props-${kind}`);
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
