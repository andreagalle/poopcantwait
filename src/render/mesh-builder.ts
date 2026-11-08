import { Mesh, PRIMITIVE_TRIANGLES } from 'playcanvas';
import type { Color, GraphicsDevice } from 'playcanvas';

type Vec = readonly [number, number, number];

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
 * `diffuseVertexColor` set.
 */
export class MeshBuilder {
    private readonly positions: number[] = [];
    private readonly normals: number[] = [];
    private readonly colors: number[] = [];
    private readonly indices: number[] = [];

    get vertexCount(): number {
        return this.positions.length / 3;
    }

    /** A convex polygon, its corners counter-clockwise when seen from the side it faces. */
    addFace(corners: readonly Vec[], color: Color): void {
        const normal = normalize(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])));
        const base = this.vertexCount;
        // Colours are given in sRGB; vertex colours are stored in linear space
        const linear = color.clone().linear();
        const rgba = [linear.r * 255, linear.g * 255, linear.b * 255, linear.a * 255].map(Math.round);
        for (const p of corners) {
            this.positions.push(p[0], p[1], p[2]);
            this.normals.push(normal[0], normal[1], normal[2]);
            this.colors.push(...rgba);
        }
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

    build(device: GraphicsDevice): Mesh {
        const mesh = new Mesh(device);
        mesh.setPositions(this.positions);
        mesh.setNormals(this.normals);
        mesh.setColors32(this.colors);
        mesh.setIndices(new Uint32Array(this.indices));
        mesh.update(PRIMITIVE_TRIANGLES);
        return mesh;
    }
}
