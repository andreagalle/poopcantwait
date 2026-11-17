import {
    BUFFER_DYNAMIC,
    Color,
    Entity,
    Mat4,
    Mesh,
    MeshInstance,
    Quat,
    SphereGeometry,
    StandardMaterial,
    Vec3,
    VertexBuffer,
    VertexFormat
} from 'playcanvas';
import type { AppBase, Asset } from 'playcanvas';

import type { AssetId } from '../assets/registry';
import type { Game } from '../core/game';
import type { Light } from '../core/traffic/signals';
import { lightAt } from '../core/traffic/signals';
import type { SignKind, StreetSign } from '../core/traffic/street-signs';
import { MeshBuilder } from '../render/mesh-builder';
import { PALETTE } from '../render/palette';
import { SIDEWALK_HEIGHT } from '../render/sidewalk-map';

import { pieceOf } from './props-view';

/** The felt model of each kind of pole at the crossings (design: *Street props*). */
export const SIGN_MODELS = {
    'traffic-light': 'street.traffic-light',
    stop: 'street.stop-sign',
    'give-way': 'street.give-way',
    crossing: 'street.crossing-sign',
    'speed-30': 'street.speed-30'
} as const satisfies Record<SignKind, AssetId>;

/** How tall each pole stands, in metres; it keeps its proportions. */
const HEIGHT: Record<SignKind, number> = {
    'traffic-light': 3.2,
    stop: 2.4,
    'give-way': 2.4,
    crossing: 2.5,
    'speed-30': 2.4
};

/**
 * The traffic light's three lamps on its model, measured on it: their heights as shares of the light's, how far in front
 * of the pole they sit and how big they are, in metres. The lit one glows over the felt lamp, which is dark.
 */
const LAMPS = { heights: { red: 0.885, amber: 0.75, green: 0.615 }, forwardMetres: 0.42, radiusMetres: 0.12 };
const LAMP_COLOURS: Record<Light, Color> = {
    red: PALETTE.beaconOccupied,
    amber: new Color(1, 0.72, 0.15),
    green: PALETTE.beaconFree
};

function glowMaterial(name: string, color: Color): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.diffuse.set(0, 0, 0);
    material.emissive.copy(color);
    material.useLighting = false;
    material.update();
    return material;
}

/**
 * The traffic lights and road signs at the crossings: each kind drawn in one call, with hardware instancing, from its
 * felt model, or in greybox should it fail to load. A traffic light's lit lamp is a glowing ball over the felt one, one
 * instanced draw call per colour, updated as the lights change.
 */
export class SignsView {
    readonly root = new Entity('signs');
    private readonly lights: { sign: StreetSign; at: Record<Light, Vec3> }[] = [];
    private readonly lamps: Record<Light, { buffer: VertexBuffer; matrices: Float32Array }>;
    private readonly shown: (Light | null)[] = [];

    constructor(app: AppBase, signs: readonly StreetSign[], models: ReadonlyMap<AssetId, Asset>) {
        const device = app.graphicsDevice;
        const format = VertexFormat.getDefaultInstancingFormat(device);
        const turn = new Quat();
        const scale = new Vec3();
        const position = new Vec3();
        const trs = new Mat4();
        const world = new Mat4();
        const greybox = new MeshBuilder();
        for (const kind of Object.keys(SIGN_MODELS) as SignKind[]) {
            const list = signs.filter((s) => s.kind === kind);
            if (list.length === 0) {
                continue;
            }
            const piece = pieceOf(models.get(SIGN_MODELS[kind]));
            if (!piece) {
                for (const s of list) {
                    greybox.addCylinder(s.x, s.z, 0.06, 0, HEIGHT[kind], PALETTE.hedge, 6);
                }
                continue;
            }
            const matrices = new Float32Array(list.length * 16);
            const s = HEIGHT[kind] / piece.extents.y;
            list.forEach((sign, i) => {
                position.set(sign.x, SIDEWALK_HEIGHT, sign.z);
                turn.setFromEulerAngles(0, (Math.atan2(sign.facing.x, sign.facing.z) * 180) / Math.PI, 0);
                trs.setTRS(position, turn, scale.set(s, s, s));
                world.mul2(trs, piece.base);
                matrices.set(world.data, i * 16);
            });
            const instance = new MeshInstance(piece.mesh, piece.material);
            instance.setInstancing(new VertexBuffer(device, format, list.length, { data: matrices }));
            const entity = new Entity(`signs-${kind}`);
            entity.addComponent('render', { meshInstances: [instance], castShadows: true, receiveShadows: true });
            this.root.addChild(entity);
        }
        if (greybox.vertexCount > 0) {
            const entity = new Entity('signs-greybox');
            const material = new StandardMaterial();
            material.diffuseVertexColor = true;
            material.update();
            entity.addComponent('render', {
                meshInstances: [new MeshInstance(greybox.build(device), material)],
                castShadows: true
            });
            this.root.addChild(entity);
        }

        // The lamps of the traffic lights: where each one's red, amber and green balls go
        for (const sign of signs.filter((s) => s.light)) {
            const forward = LAMPS.forwardMetres;
            const at = (share: number): Vec3 =>
                new Vec3(
                    sign.x + sign.facing.x * forward,
                    SIDEWALK_HEIGHT + share * HEIGHT['traffic-light'],
                    sign.z + sign.facing.z * forward
                );
            this.lights.push({
                sign,
                at: { red: at(LAMPS.heights.red), amber: at(LAMPS.heights.amber), green: at(LAMPS.heights.green) }
            });
            this.shown.push(null);
        }
        const ball = Mesh.fromGeometry(device, new SphereGeometry({ radius: 1, latitudeBands: 8, longitudeBands: 8 }));
        const make = (light: Light): { buffer: VertexBuffer; matrices: Float32Array } => {
            const count = Math.max(1, this.lights.length);
            const matrices = new Float32Array(count * 16);
            const buffer = new VertexBuffer(device, format, count, { usage: BUFFER_DYNAMIC, data: matrices });
            const instance = new MeshInstance(ball, glowMaterial(`lamp-${light}`, LAMP_COLOURS[light]));
            instance.setInstancing(buffer);
            const entity = new Entity(`lamps-${light}`);
            entity.addComponent('render', { meshInstances: [instance], castShadows: false, receiveShadows: false });
            this.root.addChild(entity);
            return { buffer, matrices };
        };
        this.lamps = { red: make('red'), amber: make('amber'), green: make('green') };
        app.root.addChild(this.root);
    }

    /** Lights each traffic light's lamp for what it shows now. */
    update(game: Game): void {
        let changed = false;
        this.lights.forEach(({ sign }, i) => {
            const signal = game.signals.get(sign.light!.node);
            const light = signal ? lightAt(signal, sign.light!.axis, game.time) : null;
            if (light !== this.shown[i]) {
                this.shown[i] = light;
                changed = true;
            }
        });
        if (!changed) {
            return;
        }
        const r = LAMPS.radiusMetres;
        for (const colour of ['red', 'amber', 'green'] as const) {
            const { buffer, matrices } = this.lamps[colour];
            matrices.fill(0);
            this.lights.forEach(({ at }, i) => {
                if (this.shown[i] === colour) {
                    const p = at[colour];
                    // A scaled translation: column-major, the scale on the diagonal and the position in the last column
                    matrices[i * 16] = r;
                    matrices[i * 16 + 5] = r;
                    matrices[i * 16 + 10] = r;
                    matrices[i * 16 + 12] = p.x;
                    matrices[i * 16 + 13] = p.y;
                    matrices[i * 16 + 14] = p.z;
                    matrices[i * 16 + 15] = 1;
                }
            });
            buffer.unlock();
        }
    }
}
