import type { VoiceTarget } from './synth';
import { pluck, tick } from './synth';

/**
 * The light comedic music loop (design: *Audio*), an original four-bar tune in C major written for this game: an
 * "oom-pah" bass on the beats, a bouncy staccato melody in eighth notes and a hi-hat on the off-beats. It is played
 * by a look-ahead scheduler, so the timing comes from the audio clock, not from frame times.
 */

/** Melody in eighth notes, as MIDI note numbers; `null` is a rest. Chords: C, A minor, F, G. */
// prettier-ignore
const MELODY: readonly (number | null)[] = [
    72, null, 76, 79, null, 76, 74, 72,
    69, null, 72, 76, 74, null, 72, 69,
    65, 69, 72, null, 77, 76, 74, 72,
    74, null, 71, 67, 71, 74, 79, null
];

/** Bass in quarter notes (every second eighth), as MIDI note numbers. */
const BASS: readonly number[] = [48, 55, 48, 55, 45, 52, 45, 52, 41, 48, 41, 48, 43, 50, 43, 47];

/** How far ahead notes are scheduled, in seconds, and how often the scheduler wakes up, in milliseconds. */
const LOOK_AHEAD_SECONDS = 0.15;
const WAKE_MS = 30;

/** Plays the loop while started; the tempo can change at any time and applies from the next eighth note. */
export class MusicLoop {
    private readonly target: VoiceTarget;
    private timer: ReturnType<typeof setInterval> | null = null;
    private step = 0;
    private nextTime = 0;
    private beatsPerMinute: number;

    constructor(target: VoiceTarget, beatsPerMinute: number) {
        this.target = target;
        this.beatsPerMinute = beatsPerMinute;
    }

    get playing(): boolean {
        return this.timer !== null;
    }

    setTempo(beatsPerMinute: number): void {
        this.beatsPerMinute = beatsPerMinute;
    }

    /** Starts from the top of the loop. */
    start(): void {
        if (this.timer !== null) {
            return;
        }
        this.step = 0;
        this.nextTime = this.target.ctx.currentTime + 0.05;
        this.timer = setInterval(() => this.schedule(), WAKE_MS);
        this.schedule();
    }

    /** Stops scheduling; notes already scheduled ring out (a fraction of a second). */
    stop(): void {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private schedule(): void {
        const now = this.target.ctx.currentTime;
        // After a stall (a hidden tab throttles timers) skip ahead instead of playing a burst of late notes
        if (this.nextTime < now) {
            this.nextTime = now + 0.02;
        }
        while (this.nextTime < now + LOOK_AHEAD_SECONDS) {
            this.playStep(this.step, this.nextTime);
            this.nextTime += 60 / this.beatsPerMinute / 2;
            this.step = (this.step + 1) % MELODY.length;
        }
    }

    private playStep(step: number, at: number): void {
        const eighth = 60 / this.beatsPerMinute / 2;
        const note = MELODY[step];
        if (note !== null && note !== undefined) {
            pluck(this.target, 'square', note, at, eighth * 0.8, 0.07);
        }
        if (step % 2 === 0) {
            pluck(this.target, 'triangle', BASS[step / 2]!, at, eighth * 1.6, 0.32);
        } else {
            tick(this.target, at, 0.05);
        }
    }
}
