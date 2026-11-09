import { describe, expect, it } from 'vitest';

import { AUDIO, URGENCY } from '../../config/tuning';
import type { GameEvent } from '../game';
import type { UrgencyState } from '../urgency/urgency';
import { initialUrgency } from '../urgency/urgency';

import type { RumbleState } from './director';
import { cueFor, initialRumble, musicTempo, rumbleInterval, tickRumble } from './director';

const withSecondsLeft = (secondsLeft: number, accidentSecondsLeft = 0): UrgencyState => ({
    ...initialUrgency(),
    secondsLeft,
    accidentSecondsLeft
});

/** Ticks the rumble timer in 60 Hz steps while the countdown runs down from `from`, and returns the rumble times. */
function rumbleTimes(from: number, seconds: number, playing = true): number[] {
    const dt = 1 / 60;
    const times: number[] = [];
    let state: RumbleState = initialRumble();
    for (let i = 0; i < Math.round(seconds / dt); i++) {
        const t = i * dt;
        const next = tickRumble(state, withSecondsLeft(Math.max(0.01, from - t)), playing, dt);
        state = next.state;
        if (next.rumble) {
            times.push(t);
        }
    }
    return times;
}

describe('cueFor', () => {
    it('plays a sound for eating, relief, traffic and accidents', () => {
        expect(cueFor('ateJunk')).toBe('chomp');
        expect(cueFor('ateVegetable')).toBe('ew');
        expect(cueFor('reliefStart')).toBe('flush');
        expect(cueFor('crumple')).toBe('crunch');
        expect(cueFor('honk')).toBe('horn');
        expect(cueFor('accident')).toBe('sting');
        expect(cueFor('knocked')).toBe('bonk');
    });

    it('stays quiet for bookkeeping events', () => {
        const silent: GameEvent[] = ['accidentOver', 'gameOver', 'reliefEnd', 'popupGone', 'tierChanged', 'squeezed'];
        expect(silent.map(cueFor)).toEqual(silent.map(() => null));
    });
});

describe('rumbleInterval', () => {
    it('shrinks from the longest interval at the warning to the shortest at 0', () => {
        expect(rumbleInterval(URGENCY.lowWarningSeconds)).toBeCloseTo(AUDIO.rumbleIntervalSeconds.max);
        expect(rumbleInterval(0)).toBeCloseTo(AUDIO.rumbleIntervalSeconds.min);
        expect(rumbleInterval(URGENCY.lowWarningSeconds / 2)).toBeLessThan(rumbleInterval(URGENCY.lowWarningSeconds));
        expect(rumbleInterval(1000)).toBeCloseTo(AUDIO.rumbleIntervalSeconds.max);
    });
});

describe('tickRumble', () => {
    it('stays quiet while the countdown is healthy', () => {
        expect(rumbleTimes(URGENCY.countdownSeconds, 5)).toEqual([]);
    });

    it('rumbles as soon as the countdown turns low, then more and more often', () => {
        const times = rumbleTimes(URGENCY.lowWarningSeconds + 1, URGENCY.lowWarningSeconds + 1);
        expect(times[0]).toBeCloseTo(1, 1);
        expect(times.length).toBeGreaterThanOrEqual(4);
        const gaps = times.slice(1).map((t, i) => t - times[i]!);
        expect(gaps[0]).toBeCloseTo(AUDIO.rumbleIntervalSeconds.max, 0);
        expect(gaps.at(-1)!).toBeLessThan(gaps[0]!);
        for (const gap of gaps) {
            expect(gap).toBeGreaterThanOrEqual(AUDIO.rumbleIntervalSeconds.min - 1 / 60);
        }
    });

    it('stays quiet inside a toilet and during an accident, and starts over afterwards', () => {
        expect(rumbleTimes(5, 3, false)).toEqual([]);
        const frozen = tickRumble(initialRumble(), withSecondsLeft(0, 1), true, 1 / 60);
        expect(frozen.rumble).toBe(false);
        expect(frozen.state).toEqual(initialRumble());
    });
});

describe('musicTempo', () => {
    it('speeds the music up while the countdown is low', () => {
        expect(musicTempo(withSecondsLeft(URGENCY.countdownSeconds))).toBe(AUDIO.musicBeatsPerMinute);
        expect(musicTempo(withSecondsLeft(URGENCY.lowWarningSeconds / 2))).toBeCloseTo(
            AUDIO.musicBeatsPerMinute * AUDIO.urgentTempoFactor
        );
    });
});
