import { AUDIO, URGENCY } from '../../config/tuning';
import type { GameEvent } from '../game';
import type { UrgencyState } from '../urgency/urgency';
import { isLow } from '../urgency/urgency';

/**
 * The sound effects (design: *Audio*): a chomp for junk food, "ew" for vegetables, the tummy rumble, the flush, the
 * car crunch, the horn, the accident sting, and a bonk when a vehicle knocks Benny over.
 */
export type Cue = 'chomp' | 'ew' | 'rumble' | 'flush' | 'crunch' | 'horn' | 'sting' | 'bonk';

const EVENT_CUES: Readonly<Partial<Record<GameEvent, Cue>>> = {
    ateJunk: 'chomp',
    ateVegetable: 'ew',
    reliefStart: 'flush',
    crumple: 'crunch',
    honk: 'horn',
    accident: 'sting',
    knocked: 'bonk'
};

/** The sound effect a game event plays, if any. */
export function cueFor(event: GameEvent): Cue | null {
    return EVENT_CUES[event] ?? null;
}

/** Seconds between tummy rumbles with `secondsLeft` on a low countdown: longer at first, shorter near 0. */
export function rumbleInterval(secondsLeft: number): number {
    const { min, max } = AUDIO.rumbleIntervalSeconds;
    const share = Math.min(1, Math.max(0, secondsLeft / URGENCY.lowWarningSeconds));
    return min + (max - min) * share;
}

/** When the tummy rumbles next, in seconds of play; 0 when the countdown is not low. */
export interface RumbleState {
    readonly secondsToNext: number;
}

export function initialRumble(): RumbleState {
    return { secondsToNext: 0 };
}

/**
 * Advances the rumble timer by `dt` seconds of simulation. The tummy rumbles as soon as the countdown turns low and
 * Benny is out in the city (`playing`), then at `rumbleInterval`; never in a toilet, during an accident or on a
 * healthy countdown.
 */
export function tickRumble(
    state: RumbleState,
    urgency: UrgencyState,
    playing: boolean,
    dt: number
): { state: RumbleState; rumble: boolean } {
    if (!playing || !isLow(urgency)) {
        return { state: initialRumble(), rumble: false };
    }
    const secondsToNext = state.secondsToNext - dt;
    if (secondsToNext > 0) {
        return { state: { secondsToNext }, rumble: false };
    }
    return { state: { secondsToNext: rumbleInterval(urgency.secondsLeft) }, rumble: true };
}

/** The music tempo, in beats per minute: faster while the countdown is low. */
export function musicTempo(urgency: UrgencyState): number {
    return AUDIO.musicBeatsPerMinute * (isLow(urgency) ? AUDIO.urgentTempoFactor : 1);
}
