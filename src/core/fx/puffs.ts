import { EFFECTS } from '../../config/tuning';
import type { Rng } from '../rng';

/**
 * Puffs (design: *Game feel*): small round particles for crumbs out of a bite, leaves out of a vegetable, smoke from
 * a crumpled vehicle, dust where Benny is knocked over, and the stink cloud of an accident. Pure presentation: the
 * views spawn and advance them with the frame's simulated time, so they freeze with the pause.
 */
export type PuffKind = 'crumb' | 'leaf' | 'smoke' | 'dust' | 'stink';

export interface Puff {
    readonly kind: PuffKind;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly vx: number;
    readonly vy: number;
    readonly vz: number;
    /** Seconds since it appeared. */
    readonly age: number;
    readonly lifeSeconds: number;
    /** Largest diameter, in metres. */
    readonly size: number;
}

type BurstKind = 'bite' | 'vegetable' | 'crumple' | 'knocked';

const BURSTS: Readonly<
    Record<BurstKind, { kind: PuffKind; spec: (typeof EFFECTS.puffs)['bite' | 'crumple' | 'knocked']; height: number }>
> = {
    bite: { kind: 'crumb', spec: EFFECTS.puffs.bite, height: 0.9 },
    vegetable: { kind: 'leaf', spec: EFFECTS.puffs.bite, height: 0.9 },
    crumple: { kind: 'smoke', spec: EFFECTS.puffs.crumple, height: 0.8 },
    knocked: { kind: 'dust', spec: EFFECTS.puffs.knocked, height: 0.2 }
};

/**
 * A ring of puffs flying out from a spot, evenly spaced with a little random scatter, from `y` metres up (by default a
 * height that suits the kind: a bite at mouth height, dust at the feet).
 */
export function burst(what: BurstKind, x: number, z: number, rng: Rng, y?: number): Puff[] {
    const { kind, spec, height } = BURSTS[what];
    const puffs: Puff[] = [];
    for (let i = 0; i < spec.count; i++) {
        const angle = (2 * Math.PI * i) / spec.count + rng.range(-0.3, 0.3);
        const speed = spec.speed * rng.range(0.7, 1.15);
        const falls = kind === 'crumb' || kind === 'leaf';
        puffs.push({
            kind,
            x,
            y: y ?? height,
            z,
            vx: Math.cos(angle) * speed,
            vy: falls ? spec.speed * rng.range(0.8, 1.3) : spec.speed * rng.range(0.3, 0.6),
            vz: Math.sin(angle) * speed,
            age: 0,
            lifeSeconds: spec.lifeSeconds * rng.range(0.85, 1.15),
            size: spec.size * rng.range(0.8, 1.2)
        });
    }
    return puffs;
}

/** One puff of the stink cloud, rising from around Benny of `radius` metres; `thin` for the trail after an accident. */
export function stinkPuff(x: number, z: number, radius: number, thin: boolean, rng: Rng): Puff {
    const spec = EFFECTS.puffs.stink;
    const angle = rng.range(0, 2 * Math.PI);
    const r = radius * rng.range(0.4, 1);
    return {
        kind: 'stink',
        x: x + Math.cos(angle) * r,
        y: rng.range(0.3, 1.2),
        z: z + Math.sin(angle) * r,
        vx: Math.cos(angle) * spec.speed * 0.4,
        vy: spec.speed * rng.range(0.7, 1.3),
        vz: Math.sin(angle) * spec.speed * 0.4,
        age: 0,
        lifeSeconds: spec.lifeSeconds * rng.range(0.8, 1.2),
        size: spec.size * rng.range(0.7, 1.2) * (thin ? 0.6 : 1)
    };
}

/** Advances every puff by `dt` seconds and drops the ones that are done (or fell through the ground). */
export function tickPuffs(puffs: readonly Puff[], dt: number): Puff[] {
    if (dt <= 0) {
        return [...puffs];
    }
    const out: Puff[] = [];
    const drag = Math.exp(-EFFECTS.puffs.dragPerSecond * dt);
    for (const p of puffs) {
        const age = p.age + dt;
        if (age >= p.lifeSeconds) {
            continue;
        }
        const falls = p.kind === 'crumb' || p.kind === 'leaf';
        const vy = falls ? p.vy - EFFECTS.puffs.gravity * dt : p.vy * drag;
        const y = p.y + vy * dt;
        if (falls && y < 0) {
            continue;
        }
        const scale = falls ? 1 : drag;
        out.push({ ...p, age, x: p.x + p.vx * dt, y, z: p.z + p.vz * dt, vx: p.vx * scale, vy, vz: p.vz * scale });
    }
    return out;
}

/** The puff's diameter now: it pops up to full size in the first fifth of its life and shrinks away after. */
export function puffDiameter(p: Puff): number {
    const t = Math.min(1, Math.max(0, p.age / p.lifeSeconds));
    const grow = Math.min(1, t / 0.2);
    const shrink = t < 0.2 ? 1 : 1 - (t - 0.2) / 0.8;
    return p.size * grow * Math.sqrt(Math.max(0, shrink));
}
