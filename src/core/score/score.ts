import { SCORING } from '../../config/tuning';

/** The score and the combo (design: *Scoring*). Pure state: every function returns the new state and the points. */
export interface ScoreState {
    readonly points: number;
    /** Combo multiplier on junk food points, from 1 to `SCORING.combo.max`. */
    readonly multiplier: number;
    /** Seconds left to eat again and raise the combo; at 0 the multiplier is back to 1. */
    readonly comboSecondsLeft: number;
}

export const initialScore = (): ScoreState => ({ points: 0, multiplier: 1, comboSecondsLeft: 0 });

/** Lets the combo run out: 3 s without eating junk food and the multiplier drops back to 1. */
export function tickScore(state: ScoreState, dt: number): ScoreState {
    if (state.comboSecondsLeft <= 0) {
        return state;
    }
    const comboSecondsLeft = Math.max(0, state.comboSecondsLeft - dt);
    return { ...state, comboSecondsLeft, multiplier: comboSecondsLeft > 0 ? state.multiplier : 1 };
}

/** Junk food: its points times the combo; eating again within the window raises the combo by a step, up to the max. */
export function scoreJunk(state: ScoreState, basePoints: number): { state: ScoreState; gained: number } {
    const { windowSeconds, step, max } = SCORING.combo;
    const multiplier = state.comboSecondsLeft > 0 ? Math.min(max, state.multiplier + step) : 1;
    const gained = Math.round(basePoints * multiplier);
    return { state: { points: state.points + gained, multiplier, comboSecondsLeft: windowSeconds }, gained };
}

/** Relief: a base bonus plus the clutch bonus for every second left on the countdown. */
export function scoreRelief(state: ScoreState, secondsLeft: number): { state: ScoreState; gained: number } {
    const { basePoints, pointsPerSecondLeft } = SCORING.relief;
    const gained = basePoints + Math.round(pointsPerSecondLeft * Math.max(0, secondsLeft));
    return { state: { ...state, points: state.points + gained }, gained };
}

/** A crumpled vehicle (milestone M5). */
export function scoreCrumple(state: ScoreState, vehicle: 'car' | 'bus'): { state: ScoreState; gained: number } {
    const gained = SCORING.crumplePoints[vehicle];
    return { state: { ...state, points: state.points + gained }, gained };
}
