import { StandardMaterial } from 'playcanvas';
import type { Color } from 'playcanvas';

/** A matte, non-metallic material in a flat colour: the greybox look, and the base for the toy-town palette. */
export function createFlatMaterial(name: string, color: Color): StandardMaterial {
    const material = new StandardMaterial();
    material.name = name;
    material.diffuse.copy(color);
    material.useMetalness = true;
    material.metalness = 0;
    material.gloss = 0.25;
    material.update();
    return material;
}
