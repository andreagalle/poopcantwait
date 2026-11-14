import { BENNY_CLIPS } from '../../config/tuning';

/** Benny's animation clips (design: *The protagonist*, animations), by the names they have in his model. */
export type BennyClip = 'idle' | 'walk' | 'run' | 'waddle' | 'fall';

export interface ClipInput {
    /** Knocked over by a vehicle (stunned). */
    readonly knocked: boolean;
    /** Frozen in an accident: he stands and shivers (the shiver is procedural). */
    readonly accident: boolean;
    /** His speed as a share of his top speed at his weight, 0 to 1. */
    readonly speedShare: number;
    /** The countdown is low: he runs with a clenched waddle. */
    readonly low: boolean;
}

/**
 * Which clip Benny plays and how fast: fallen over while knocked, standing in an accident or when still, a clenched
 * waddle on a low countdown, otherwise a walk that turns into a run as he speeds up, played faster the faster he goes
 * so his feet keep up with the ground.
 */
export function bennyClip(input: ClipInput): { clip: BennyClip; speed: number } {
    if (input.knocked) {
        return { clip: 'fall', speed: 1 };
    }
    // A non-finite share (a glitch upstream) must not reach the playback speed: it would freeze the pose
    const share = Number.isFinite(input.speedShare) ? Math.max(0, Math.min(1, input.speedShare)) : 0;
    if (input.accident || share < BENNY_CLIPS.moveShare) {
        return { clip: 'idle', speed: 1 };
    }
    const clip: BennyClip = input.low ? 'waddle' : share < BENNY_CLIPS.runShare ? 'walk' : 'run';
    const { min, max } = BENNY_CLIPS.playbackSpeed;
    return { clip, speed: min + (max - min) * share };
}
