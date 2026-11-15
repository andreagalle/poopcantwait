import { BENNY_CLIPS } from '../../config/tuning';

/** Benny's animation clips (design: *The protagonist*, animations), by the names they have in his model. */
export type BennyClip = 'idle' | 'walk' | 'fall';

export interface ClipInput {
    /** Knocked over by a vehicle (stunned). */
    readonly knocked: boolean;
    /** Frozen in an accident: he stands and shivers (the shiver is procedural). */
    readonly accident: boolean;
    /** His speed over the ground, in m/s. */
    readonly speed: number;
}

/**
 * Which clip Benny plays and how fast: fallen over while knocked, standing in an accident or when still, otherwise a
 * brisk walk whose cadence follows his speed over the ground, so his feet keep up with it (up to a limit, past which
 * he slides a little rather than spin his legs). No run: a run swung his arms wide and looked like skating.
 */
export function bennyClip(input: ClipInput): { clip: BennyClip; speed: number } {
    if (input.knocked) {
        return { clip: 'fall', speed: 1 };
    }
    // A non-finite speed (a glitch upstream) must not reach the playback speed: it would freeze the pose
    const speed = Number.isFinite(input.speed) ? Math.max(0, input.speed) : 0;
    if (input.accident || speed < BENNY_CLIPS.moveMetresPerSecond) {
        return { clip: 'idle', speed: 1 };
    }
    const { min, max } = BENNY_CLIPS.playbackSpeed;
    return { clip: 'walk', speed: Math.max(min, Math.min(max, speed / BENNY_CLIPS.walkMetresPerSecond)) };
}
