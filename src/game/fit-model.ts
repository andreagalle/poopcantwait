import { BoundingBox, Entity } from 'playcanvas';
import type { Asset, ContainerResource, RenderComponent } from 'playcanvas';

/** The size a model is stretched to, in metres, after it is turned: width along x, height along y, length along z. */
export interface ModelFit {
    readonly width: number;
    readonly height: number;
    readonly length: number;
    /** Turn about the vertical axis first, in degrees, so the model's front points along +z (a multiple of 90). */
    readonly yawDegrees?: number;
}

/** The bounds of every mesh under an entity, in its own space (call it before the entity is placed or scaled). */
function bounds(entity: Entity): BoundingBox {
    const box = new BoundingBox();
    let first = true;
    for (const render of entity.findComponents('render') as RenderComponent[]) {
        for (const instance of render.meshInstances) {
            if (first) {
                box.copy(instance.aabb);
                first = false;
            } else {
                box.add(instance.aabb);
            }
        }
    }
    return box;
}

/**
 * A model from the art pass, standing on the ground (its lowest point at y = 0), centred, turned so its front points
 * along +z and stretched to a size, so what is seen matches what the game collides with. The returned entity is named
 * `name`; scale it further, or move and turn it, like any other.
 */
export function fittedModel(asset: Asset, fit: ModelFit, name: string): Entity {
    const model = (asset.resource as ContainerResource).instantiateRenderEntity();
    const box = bounds(model);
    const { center, halfExtents } = box;
    model.setLocalPosition(-center.x, -(center.y - halfExtents.y), -center.z);

    const yaw = fit.yawDegrees ?? 0;
    const turn = new Entity(`${name}-turn`);
    turn.addChild(model);
    turn.setLocalEulerAngles(0, yaw, 0);
    // A quarter turn swaps the model's x and z extents
    const quarter = Math.abs(Math.round(yaw / 90)) % 2 === 1;
    const across = 2 * (quarter ? halfExtents.z : halfExtents.x);
    const along = 2 * (quarter ? halfExtents.x : halfExtents.z);

    const pivot = new Entity(name);
    pivot.addChild(turn);
    pivot.setLocalScale(fit.width / across, fit.height / (2 * halfExtents.y), fit.length / along);
    return pivot;
}
