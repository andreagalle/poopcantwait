import { Mesh, PRIMITIVE_TRIANGLES } from 'playcanvas';
import type { Color, GraphicsDevice } from 'playcanvas';

type Vec = readonly [number, number, number];

/** Where untextured faces sample a texture: a corner of the facade tile, plain wall. */
const PLAIN_UV: readonly [number, number] = [0.03, 0.03];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
];
const normalize = (a: Vec): Vec => {
    const length = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / length, a[1] / length, a[2] / length];
};

/**
 * Collects flat-shaded, vertex-coloured faces into one mesh, so a whole layer of the city (all roads, all buildings)
 * draws in a single call. Faces wind counter-clockwise around their outward normal. Draw it with a material that has
 * `diffuseVertexColor` set. Faces may carry texture coordinates; the others get world ones (`worldUvMetres`) or one
 * plain spot of the texture (`plainUv`).
 */
export class MeshBuilder {
    private readonly positions: number[] = [];
    private readonly normals: number[] = [];
    private readonly colors: number[] = [];
    private readonly uvs: number[] = [];
    private readonly indices: number[] = [];
    private textured = false;
    /** Faces given no texture coordinates get world ones, a texture repeat every this many metres (0: none). */
    private readonly worldUvMetres: number;

    /** Where faces with no texture coordinates sample the texture, when they get no world ones either. */
    private readonly plainUv: readonly [number, number];

    constructor(options: { readonly worldUvMetres?: number; readonly plainUv?: readonly [number, number] } = {}) {
        this.worldUvMetres = options.worldUvMetres ?? 0;
        this.plainUv = options.plainUv ?? PLAIN_UV;
    }

    get vertexCount(): number {
        return this.positions.length / 3;
    }

    /**
     * A convex polygon, its corners counter-clockwise when seen from the side it faces, with a texture coordinate per
     * corner if given.
     */
    addFace(corners: readonly Vec[], color: Color, uv?: readonly (readonly [number, number])[]): void {
        const normal = normalize(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])));
        const base = this.vertexCount;
        // Colours are given in sRGB; vertex colours are stored in linear space
        const linear = color.clone().linear();
        const rgba = [linear.r * 255, linear.g * 255, linear.b * 255, linear.a * 255].map(Math.round);
        const s = this.worldUvMetres;
        corners.forEach((p, i) => {
            this.positions.push(p[0], p[1], p[2]);
            this.normals.push(normal[0], normal[1], normal[2]);
            this.colors.push(...rgba);
            if (uv) {
                this.uvs.push(...uv[i]);
            } else if (s > 0) {
                // Lying faces take the ground's coordinates; standing ones run along the wall and up
                this.uvs.push(...(Math.abs(normal[1]) > 0.5 ? [p[0] / s, p[2] / s] : [(p[0] + p[2]) / s, p[1] / s]));
            } else {
                this.uvs.push(...this.plainUv);
            }
        });
        this.textured ||= uv !== undefined || s > 0;
        for (let i = 1; i + 1 < corners.length; i++) {
            this.indices.push(base, base + i, base + i + 1);
        }
    }

    /** A flat, upward-facing rectangle at height `y`. */
    addGroundRect(x0: number, z0: number, x1: number, z1: number, y: number, color: Color): void {
        this.addFace(
            [
                [x0, y, z0],
                [x0, y, z1],
                [x1, y, z1],
                [x1, y, z0]
            ],
            color
        );
    }

    /** An axis-aligned box without its bottom face. */
    addBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: Color, top = color): void {
        this.addGroundRect(x0, z0, x1, z1, y1, top);
        this.addFace(
            [
                [x0, y0, z1],
                [x1, y0, z1],
                [x1, y1, z1],
                [x0, y1, z1]
            ],
            color
        );
        this.addFace(
            [
                [x1, y0, z0],
                [x0, y0, z0],
                [x0, y1, z0],
                [x1, y1, z0]
            ],
            color
        );
        this.addFace(
            [
                [x1, y0, z1],
                [x1, y0, z0],
                [x1, y1, z0],
                [x1, y1, z1]
            ],
            color
        );
        this.addFace(
            [
                [x0, y0, z0],
                [x0, y0, z1],
                [x0, y1, z1],
                [x0, y1, z0]
            ],
            color
        );
    }

    /** A vertical prism approximating a cylinder, with its top cap. */
    addCylinder(cx: number, cz: number, radius: number, y0: number, y1: number, color: Color, sides = 16): void {
        const ring = (y: number): Vec[] =>
            Array.from({ length: sides }, (_, i): Vec => {
                const a = (2 * Math.PI * i) / sides;
                return [cx + radius * Math.cos(a), y, cz + radius * Math.sin(a)];
            });
        const bottom = ring(y0);
        const top = ring(y1);
        for (let i = 0; i < sides; i++) {
            const j = (i + 1) % sides;
            this.addFace([bottom[i], top[i], top[j], bottom[j]], color);
        }
        this.addFace([...top].reverse(), color);
    }

    /** A vertical cone (a pyramid with few sides), base at `y0` and apex at `y1`. */
    addCone(
        cx: number,
        cz: number,
        radius: number,
        y0: number,
        y1: number,
        color: Color,
        sides = 12,
        startAngle = 0
    ): void {
        const apex: Vec = [cx, y1, cz];
        const base = Array.from({ length: sides }, (_, i): Vec => {
            const a = startAngle + (2 * Math.PI * i) / sides;
            return [cx + radius * Math.cos(a), y0, cz + radius * Math.sin(a)];
        });
        for (let i = 0; i < sides; i++) {
            this.addFace([base[i], apex, base[(i + 1) % sides]], color);
        }
    }

    /** Adds everything another builder holds, as it is: building one mesh out of pieces made once. */
    append(other: MeshBuilder): void {
        const base = this.vertexCount;
        // A loop, not a spread: a whole city's worth of numbers is too many arguments for one call
        const pushAll = (target: number[], source: readonly number[]): void => {
            for (const value of source) {
                target.push(value);
            }
        };
        pushAll(this.positions, other.positions);
        pushAll(this.normals, other.normals);
        pushAll(this.colors, other.colors);
        pushAll(this.uvs, other.uvs);
        for (const index of other.indices) {
            this.indices.push(base + index);
        }
        this.textured ||= other.textured;
    }

    build(device: GraphicsDevice): Mesh {
        return meshFromArrays(device, [this.toArrays()]);
    }

    /** What it holds as typed arrays, ready to be put together with others quickly (`meshFromArrays`). */
    toArrays(): MeshArrays {
        return {
            positions: new Float32Array(this.positions),
            normals: new Float32Array(this.normals),
            colors: new Uint8Array(this.colors),
            uvs: this.textured ? new Float32Array(this.uvs) : null,
            indices: new Uint32Array(this.indices)
        };
    }
}

/** A piece of mesh as typed arrays: 3 numbers a vertex for positions and normals, 4 bytes of colour, 2 of uv. */
export interface MeshArrays {
    readonly positions: Float32Array;
    readonly normals: Float32Array;
    readonly colors: Uint8Array;
    /** null when no face has texture coordinates. */
    readonly uvs: Float32Array | null;
    readonly indices: Uint32Array;
}

/**
 * One mesh out of several pieces, copied block by block rather than number by number: fast enough to rebuild a part of
 * the city between two frames. Texture coordinates are kept if any piece has them (the others get zeros).
 */
export function meshFromArrays(device: GraphicsDevice, parts: readonly MeshArrays[]): Mesh {
    const vertices = parts.reduce((sum, p) => sum + p.positions.length / 3, 0);
    const count = parts.reduce((sum, p) => sum + p.indices.length, 0);
    const textured = parts.some((p) => p.uvs !== null);
    const positions = new Float32Array(vertices * 3);
    const normals = new Float32Array(vertices * 3);
    const colors = new Uint8Array(vertices * 4);
    const uvs = textured ? new Float32Array(vertices * 2) : null;
    const indices = new Uint32Array(count);
    let v = 0;
    let n = 0;
    for (const p of parts) {
        positions.set(p.positions, v * 3);
        normals.set(p.normals, v * 3);
        colors.set(p.colors, v * 4);
        if (uvs && p.uvs) {
            uvs.set(p.uvs, v * 2);
        }
        for (let i = 0; i < p.indices.length; i++) {
            indices[n + i] = p.indices[i] + v;
        }
        v += p.positions.length / 3;
        n += p.indices.length;
    }
    const mesh = new Mesh(device);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors32(colors);
    if (uvs) {
        mesh.setUvs(0, uvs);
    }
    mesh.setIndices(indices);
    mesh.update(PRIMITIVE_TRIANGLES);
    return mesh;
}
