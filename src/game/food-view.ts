import { BLEND_ADDITIVE, Entity, StandardMaterial } from 'playcanvas';
import type { AppBase, Color } from 'playcanvas';

import { FOOD } from '../config/tuning';
import type { JunkFoodId, VegetableId } from '../config/tuning';
import type { Game } from '../core/game';
import { PALETTE } from '../render/palette';

type FoodId = JunkFoodId | VegetableId;

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
const GLOW = { radius: 0.75, opacity: 0.5 };

function material(name: string, color: Color, glow = false): StandardMaterial {
    const m = new StandardMaterial();
    m.name = name;
    if (glow) {
        m.diffuse.set(0, 0, 0);
        m.emissive.copy(color);
        m.useLighting = false;
        m.opacity = GLOW.opacity;
        m.blendType = BLEND_ADDITIVE;
        m.depthWrite = false;
    } else {
        m.diffuse.copy(color);
        m.useMetalness = true;
        m.metalness = 0;
        m.gloss = 0.4;
    }
    m.update();
    return m;
}

interface Slot {
    readonly root: Entity;
    readonly body: Entity;
    readonly glow: Entity;
    shape: FoodId | null;
}

/**
 * Food on the streets: a pool of items that hover, bob and spin over a glow on the ground (warm gold for junk food,
 * sickly green for vegetables) and shrink away as they fade out.
 */
export class FoodView {
    private readonly slots: Slot[];
    private readonly assigned = new Map<number, Slot>();
    private readonly materials: Record<FoodId, StandardMaterial>;
    private readonly junkGlow = material('food-glow-junk', PALETTE.junkGlow, true);
    private readonly vegetableGlow = material('food-glow-vegetable', PALETTE.vegetableGlow, true);

    constructor(app: AppBase) {
        const root = new Entity('food');
        this.materials = Object.fromEntries(
            Object.entries(PALETTE.food).map(([id, color]) => [id, material(`food-${id}`, color)])
        ) as Record<FoodId, StandardMaterial>;
        this.slots = Array.from({ length: FOOD.maxActive }, (_, i) => {
            const slot = new Entity(`food-${i}`);
            const body = new Entity('food-body');
            body.addComponent('render', { type: 'box', castShadows: true, receiveShadows: false });
            const glow = new Entity('food-glow');
            glow.addComponent('render', { type: 'cylinder', material: this.junkGlow, castShadows: false });
            glow.setLocalScale(GLOW.radius * 2, 0.02, GLOW.radius * 2);
            glow.setLocalPosition(0, 0.06, 0);
            slot.addChild(body);
            slot.addChild(glow);
            slot.enabled = false;
            root.addChild(slot);
            return { root: slot, body, glow, shape: null };
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
                const shape = SHAPES[item.kind.id];
                slot.body.render!.type = shape.type;
                slot.body.render!.material = this.materials[item.kind.id];
                slot.body.setLocalScale(...shape.scale);
                slot.body.setLocalEulerAngles(shape.tilt ?? 0, 0, 0);
                slot.glow.render!.material = item.kind.category === 'junk' ? this.junkGlow : this.vegetableGlow;
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
}
