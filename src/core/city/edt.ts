/**
 * Exact Euclidean distance transform on a grid (Felzenszwalb and Huttenlocher, "Distance Transforms of Sampled
 * Functions", 2012): two passes of a one-dimensional transform built on the lower envelope of parabolas, linear in
 * the number of cells.
 */

/** Stands in for infinity inside the transform, large enough to dominate and small enough to stay finite. */
const FAR = 1e20;

function transform1d(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array): void {
    let k = 0;
    v[0] = 0;
    z[0] = -FAR;
    z[1] = FAR;
    for (let q = 1; q < n; q++) {
        let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) {
            k--;
            s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = FAR;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) {
            k++;
        }
        const d = q - v[k];
        out[q] = d * d + f[v[k]];
    }
}

/**
 * For every cell of a `width` by `height` grid (row-major, `index = z * width + x`), the Euclidean distance in cells
 * to the nearest cell where `isObstacle` is non-zero. Obstacle cells get 0. Without any obstacle every cell gets
 * `Infinity`.
 */
export function distanceTransform(isObstacle: Uint8Array, width: number, height: number): Float32Array {
    const count = width * height;
    if (isObstacle.length !== count) {
        throw new RangeError(`expected ${count} cells, got ${isObstacle.length}`);
    }
    const squared = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        squared[i] = isObstacle[i] ? 0 : FAR;
    }

    const longest = Math.max(width, height);
    const f = new Float64Array(longest);
    const out = new Float64Array(longest);
    const v = new Int32Array(longest);
    const z = new Float64Array(longest + 1);

    // Columns first, then rows
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            f[y] = squared[y * width + x];
        }
        transform1d(f, height, out, v, z);
        for (let y = 0; y < height; y++) {
            squared[y * width + x] = out[y];
        }
    }
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            f[x] = squared[row + x];
        }
        transform1d(f, width, out, v, z);
        for (let x = 0; x < width; x++) {
            squared[row + x] = out[x];
        }
    }

    const distance = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        distance[i] = squared[i] >= FAR / 2 ? Infinity : Math.sqrt(squared[i]);
    }
    return distance;
}
