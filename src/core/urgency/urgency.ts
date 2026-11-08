import { URGENCY } from '../../config/tuning';

/**
 * The urgency countdown and the underpants (design: *Urgency countdown and underpants*). Pure state: every function
 * returns a new state, and `tickUrgency` also reports what happened during the tick.
 */
export interface UrgencyState {
    /** Full length of the countdown for this run, in seconds (`URGENCY.countdownSeconds` unless overridden). */
    readonly countdownSeconds: number;
    /** Seconds left before the next accident. */
    readonly secondsLeft: number;
    /** Clean pairs of underpants left; the run ends when the last one is soiled. */
    readonly cleanUnderpants: number;
    /** While above 0, Benny is frozen in an accident, in seconds. */
    readonly accidentSecondsLeft: number;
}

export type UrgencyEvent = 'accident' | 'accidentOver' | 'outOfUnderpants';

export function initialUrgency(countdownSeconds: number = URGENCY.countdownSeconds): UrgencyState {
    return {
        countdownSeconds,
        secondsLeft: countdownSeconds,
        cleanUnderpants: URGENCY.underpants,
        accidentSecondsLeft: 0
    };
}

/** Whether the countdown is in its last seconds: red gauge, clenched waddle, rumbling tummy. */
export function isLow(state: UrgencyState): boolean {
    return state.accidentSecondsLeft === 0 && state.secondsLeft < URGENCY.lowWarningSeconds;
}

/** Whether the run is over: the last pair of underpants is soiled and the accident has played out. */
export function isOut(state: UrgencyState): boolean {
    return state.cleanUnderpants === 0 && state.accidentSecondsLeft === 0;
}

/**
 * Advances the countdown by `dt` seconds. At 0 an accident starts: a pair of underpants is soiled and Benny freezes;
 * when the freeze ends, the countdown starts again, or the run ends if no clean pair is left. `paused` holds the
 * countdown (relief in a toilet) but never an accident in progress.
 */
export function tickUrgency(
    state: UrgencyState,
    dt: number,
    paused = false
): { state: UrgencyState; events: UrgencyEvent[] } {
    if (isOut(state)) {
        return { state, events: [] };
    }
    if (state.accidentSecondsLeft > 0) {
        const left = state.accidentSecondsLeft - dt;
        if (left > 0) {
            return { state: { ...state, accidentSecondsLeft: left }, events: [] };
        }
        const over = { ...state, accidentSecondsLeft: 0, secondsLeft: state.countdownSeconds };
        return over.cleanUnderpants === 0
            ? { state: { ...over, secondsLeft: 0 }, events: ['accidentOver', 'outOfUnderpants'] }
            : { state: over, events: ['accidentOver'] };
    }
    if (paused) {
        return { state, events: [] };
    }
    const secondsLeft = state.secondsLeft - dt;
    if (secondsLeft > 0) {
        return { state: { ...state, secondsLeft }, events: [] };
    }
    return {
        state: {
            ...state,
            secondsLeft: 0,
            cleanUnderpants: state.cleanUnderpants - 1,
            accidentSecondsLeft: URGENCY.accidentFreezeSeconds
        },
        events: ['accident']
    };
}

/**
 * Takes seconds off the countdown (a vegetable, a vehicle's shock). It never goes below 0; the accident then happens
 * on the next tick. Ignored during an accident.
 */
export function penalize(state: UrgencyState, seconds: number): UrgencyState {
    if (state.accidentSecondsLeft > 0 || isOut(state)) {
        return state;
    }
    return { ...state, secondsLeft: Math.max(0, state.secondsLeft - Math.max(0, seconds)) };
}

/** Relief in a toilet: a fresh countdown. */
export function relieve(state: UrgencyState): UrgencyState {
    if (state.accidentSecondsLeft > 0 || isOut(state)) {
        return state;
    }
    return { ...state, secondsLeft: state.countdownSeconds };
}
