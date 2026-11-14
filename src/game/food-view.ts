import { Entity, StandardMaterial } from 'playcanvas';
import type { AppBase, Asset, Color, ContainerResource } from 'playcanvas';

import type { AssetId } from '../assets/registry';
import { FOOD } from '../config/tuning';
import type { JunkFoodId, VegetableId } from '../config/tuning';
import type { Game } from '../core/game';
import { PALETTE } from '../render/palette';

type FoodId = JunkFoodId | VegetableId;

/** The felt model of each item (art pass, milestone M6); the greybox shape stands in until it has loaded. */
export const FOOD_MODELS: Record<FoodId, AssetId> = {
    burger: 'food.burger',
    chickenLeg: 'food.chicken-leg',
    pizzaSlice: 'food.pizza-slice',
    hotDog: 'food.hot-dog',
    donut: 'food.donut',
    fries: 'food.fries',
    iceCreamCone: 'food.ice-cream-cone',
    beans: 'food.beans',
    cabbage: 'food.cabbage',
    brusselsSprouts: 'food.brussels-sprouts',
    broccoli: 'food.broccoli',
    cauliflower: 'food.cauliflower',
    carrot: 'food.carrot'
};
/** The models fill a 1 m cube; this is their size across, in metres (design: *Food*: about 1 m across). */
const MODEL_SIZE = 0.9;
/**
 * Some models come out standing the way their source image showed them, seen from three-quarters above: these lie
 * them down, in degrees about x then z, so they read from the camera high above (a donut flat, not on its edge).
 */
const MODEL_TILT: Partial<Record<FoodId, { x?: number; z?: number }>> = {
    chickenLeg: { z: 90 },
    pizzaSlice: { x: -90 },
    donut: { x: -90 },
    beans: { x: -90 }
};

/** A greybox stand-in per item: an engine primitive, its proportions and tilt, until the models of milestone M6. */
type Primitive = 'box' | 'capsule' | 'cone' | 'cylinder' | 'sphere' | 'torus';

const SHAPES: Record<FoodId, { type: Primitive; scale: [number, number, number]; tilt?: number }> = {
    burger: { type: 'cylinder', scale: [0.9, 0.45, 0.9] },
    chickenLeg: { type: 'capsule', scale: [0.4, 0.9, 0.4], tilt: 60 },
    pizzaSlice: { type: 'cone', scale: [0.9, 0.15, 0.9] },
    hotDog: { type: 'capsule', scale: [0.32, 1, 0.32], tilt: 90 },
    donut: { type: 'torus', scale: [0.8, 0.8, 0.8] },
    fries: { type: 'box', scale: [0.5, 0.75, 0.35] },
    iceCreamCone: { type: 'cone', scale: [0.5, 0.9, 0.5], tilt: 180 },
    beans: { type: 'sphere', scale: [0.45, 0.35, 0.6] },
    cabbage: { type: 'sphere', scale: [0.9, 0.8, 0.9] },
    brusselsSprouts: { type: 'sphere', scale: [0.5, 0.5, 0.5] },
    broccoli: { type: 'cone', scale: [0.8, 0.8, 0.8], tilt: 180 },
    cauliflower: { type: 'sphere', scale: [0.85, 0.7, 0.85] },
    carrot: { type: 'cone', scale: [0.3, 1, 0.3], tilt: 90 }
};

/** Hover height, bob and spin (design: *Food*: items bob and spin slowly). */
const HOVER = { height: 0.8, bob: 0.15, bobPerSecond: 0.8, spinDegreesPerSecond: 60, fadeSeconds: 1 };
function material(name: string, color: Color): StandardMaterial {
    const m = new StandardMaterial();
    m.name = name;
    m.diffuse.copy(color);
    m.useMetalness = true;
    m.metalness = 0;
    m.gloss = 0.4;
    m.update();
    return m;
}

interface Slot {
    readonly root: Entity;
    readonly body: Entity;
    /** The model instances this slot has shown so far, made the first time and reused. */
    readonly models: Map<FoodId, Entity>;
    shape: FoodId | null;
}

/**
 * Food on the streets: a pool of items that hover, bob and spin over their shadow, and shrink away as they fade out.
 * Each shows its felt model, or its greybox shape until the model has loaded (or if it failed to).
 */
export class FoodView {
    private readonly slots: Slot[];
    private readonly assigned = new Map<number, Slot>();
    private readonly materials: Record<FoodId, StandardMaterial>;

    private readonly modelAssets: ReadonlyMap<AssetId, Asset>;

    constructor(app: AppBase, models: ReadonlyMap<AssetId, Asset> = new Map()) {
        this.modelAssets = models;
        const root = new Entity('food');
        this.materials = Object.fromEntries(
            Object.entries(PALETTE.food).map(([id, color]) => [id, material(`food-${id}`, color)])
        ) as Record<FoodId, StandardMaterial>;
        this.slots = Array.from({ length: FOOD.maxActive }, (_, i) => {
            const slot = new Entity(`food-${i}`);
            const body = new Entity('food-body');
            body.addComponent('render', { type: 'box', castShadows: true, receiveShadows: false });
            slot.addChild(body);
            slot.enabled = false;
            root.addChild(slot);
            return { root: slot, body, models: new Map(), shape: null };
        });
        app.root.addChild(root);
    }

    update(game: Game): void {
        const live = new Set(game.food.map((f) => f.id));
        for (const [id, slot] of this.assigned) {
            if (!live.has(id)) {
                slot.root.enabled = false;
                this.assigned.delete(id);
            }
        }
        const used = new Set(this.assigned.values());
        for (const item of game.food) {
            let slot = this.assigned.get(item.id);
            if (!slot) {
                slot = this.slots.find((s) => !used.has(s));
                if (!slot) {
                    continue;
                }
                used.add(slot);
                this.assigned.set(item.id, slot);
                const model = this.modelFor(slot, item.kind.id);
                for (const [kind, entity] of slot.models) {
                    entity.enabled = kind === item.kind.id;
                }
                slot.body.enabled = model === null;
                if (!model) {
                    const shape = SHAPES[item.kind.id];
                    slot.body.render!.type = shape.type;
                    slot.body.render!.material = this.materials[item.kind.id];
                    slot.body.setLocalScale(...shape.scale);
                    slot.body.setLocalEulerAngles(shape.tilt ?? 0, 0, 0);
                }
                slot.shape = item.kind.id;
            }
            const t = game.time + item.id * 0.61;
            const fade = Math.min(1, item.secondsLeft / HOVER.fadeSeconds);
            slot.root.enabled = true;
            slot.root.setPosition(
                item.x,
                HOVER.height + HOVER.bob * Math.sin(2 * Math.PI * HOVER.bobPerSecond * t),
                item.z
            );
            slot.root.setLocalEulerAngles(0, (HOVER.spinDegreesPerSecond * t) % 360, 0);
            slot.root.setLocalScale(fade, fade, fade);
        }
    }

    /** The model instance for an item in this slot, made on first use; null when the item has no model yet. */
    private modelFor(slot: Slot, kind: FoodId): Entity | null {
        const existing = slot.models.get(kind);
        if (existing) {
            return existing;
        }
        const asset = this.modelAssets.get(FOOD_MODELS[kind]);
        if (!asset) {
            return null;
        }
        const entity = (asset.resource as ContainerResource).instantiateRenderEntity();
        entity.setLocalScale(MODEL_SIZE, MODEL_SIZE, MODEL_SIZE);
        const tilt = MODEL_TILT[kind];
        entity.setLocalEulerAngles(tilt?.x ?? 0, 0, tilt?.z ?? 0);
        slot.root.addChild(entity);
        slot.models.set(kind, entity);
        return entity;
    }
}
