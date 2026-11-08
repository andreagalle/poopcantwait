import { describe, expect, it } from 'vitest';

import { URGENCY } from '../../config/tuning';

import type { UrgencyEvent, UrgencyState } from './urgency';
import { initialUrgency, isLow, isOut, penalize, relieve, tickUrgency } from './urgency';

/** Ticks in small steps for `seconds`, collecting every event. */
function run(state: UrgencyState, seconds: number, paused = false, dt = 0.05) {
    const events: UrgencyEvent[] = [];
    let s = state;
    for (let i = 0; i < Math.round(seconds / dt); i++) {
        const next = tickUrgency(s, dt, paused);
        s = next.state;
        events.push(...next.events);
    }
    return { state: s, events };
}

describe('urgency', () => {
    it('starts at the full countdown with five clean pairs of underpants', () => {
        const s = initialUrgency();
        expect(s.secondsLeft).toBe(URGENCY.countdownSeconds);
        expect(s.cleanUnderpants).toBe(URGENCY.underpants);
        expect(isLow(s)).toBe(false);
        expect(isOut(s)).toBe(false);
        expect(initialUrgency(8).secondsLeft).toBe(8);
    });

    it('counts down and warns in the last seconds', () => {
        const { state } = run(initialUrgency(), URGENCY.countdownSeconds - URGENCY.lowWarningSeconds + 0.5);
        expect(state.secondsLeft).toBeCloseTo(URGENCY.lowWarningSeconds - 0.5, 6);
        expect(isLow(state)).toBe(true);
    });

    it('has an accident at 0: one pair soiled, a freeze, then a fresh countdown', () => {
        const atZero = run(initialUrgency(10), 10.05);
        expect(atZero.events).toEqual(['accident']);
        expect(atZero.state.cleanUnderpants).toBe(URGENCY.underpants - 1);
        expect(atZero.state.accidentSecondsLeft).toBeGreaterThan(0);
        expect(isLow(atZero.state)).toBe(false);

        const after = run(atZero.state, URGENCY.accidentFreezeSeconds);
        expect(after.events).toEqual(['accidentOver']);
        expect(after.state.accidentSecondsLeft).toBe(0);
        expect(after.state.secondsLeft).toBeGreaterThan(9.9);
    });

    it('ends the run after the fifth accident has played out', () => {
        const cycle = 3 + URGENCY.accidentFreezeSeconds;
        const { state, events } = run(initialUrgency(3), cycle * URGENCY.underpants + 1);
        expect(events.filter((e) => e === 'accident')).toHaveLength(URGENCY.underpants);
        expect(events.at(-1)).toBe('outOfUnderpants');
        expect(state.cleanUnderpants).toBe(0);
        expect(isOut(state)).toBe(true);
        // Nothing more happens once the run is over
        expect(tickUrgency(state, 100).events).toEqual([]);
        expect(penalize(state, 5)).toBe(state);
        expect(relieve(state)).toBe(state);
    });

    it('takes seconds off for vegetables and shocks, down to 0 at most', () => {
        const s = penalize(initialUrgency(), 7);
        expect(s.secondsLeft).toBe(URGENCY.countdownSeconds - 7);
        expect(penalize(s, -3)).toEqual(s);
        const empty = penalize(s, 1000);
        expect(empty.secondsLeft).toBe(0);
        expect(tickUrgency(empty, 0.01).events).toEqual(['accident']);
    });

    it('gives a fresh countdown on relief, and holds it while paused', () => {
        const tired = run(initialUrgency(), 30).state;
        expect(relieve(tired).secondsLeft).toBe(URGENCY.countdownSeconds);
        const held = run(tired, 5, true).state;
        expect(held.secondsLeft).toBeCloseTo(tired.secondsLeft, 10);
    });

    it('ignores penalties and relief during an accident, and the pause cannot stop the freeze', () => {
        const frozen = run(initialUrgency(1), 1.05).state;
        expect(penalize(frozen, 5)).toBe(frozen);
        expect(relieve(frozen)).toBe(frozen);
        const thawed = run(frozen, URGENCY.accidentFreezeSeconds, true);
        expect(thawed.events).toEqual(['accidentOver']);
    });
});
