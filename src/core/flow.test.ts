import { describe, expect, it } from 'vitest';

import type { FlowAction, Screen } from './flow';
import { isSimulating, nextScreen, tapAction } from './flow';

describe('nextScreen', () => {
    it('starts the run from the title screen with Enter or Space', () => {
        expect(nextScreen('title', 'start')).toBe('running');
    });

    it('starts a new run from the game-over screen', () => {
        expect(nextScreen('over', 'start')).toBe('restart');
    });

    it('ignores start while running or paused', () => {
        expect(nextScreen('running', 'start')).toBe('running');
        expect(nextScreen('paused', 'start')).toBe('paused');
    });

    it('toggles pause with Escape or P during a run', () => {
        expect(nextScreen('running', 'pause')).toBe('paused');
        expect(nextScreen('paused', 'pause')).toBe('running');
    });

    it('does not pause the title or game-over screens', () => {
        expect(nextScreen('title', 'pause')).toBe('title');
        expect(nextScreen('over', 'pause')).toBe('over');
    });

    it('pauses a run when the page loses focus, and stays paused', () => {
        expect(nextScreen('running', 'away')).toBe('paused');
        expect(nextScreen('paused', 'away')).toBe('paused');
        expect(nextScreen('title', 'away')).toBe('title');
        expect(nextScreen('over', 'away')).toBe('over');
    });
});

describe('isSimulating', () => {
    it('runs the simulation only during a run', () => {
        const screens: Screen[] = ['title', 'running', 'paused', 'over'];
        expect(screens.filter(isSimulating)).toEqual(['running']);
    });

    it('never leaves the game-over screen except to restart', () => {
        const actions: FlowAction[] = ['start', 'pause', 'away'];
        expect(actions.map((action) => nextScreen('over', action))).toEqual(['restart', 'over', 'over']);
    });
});

describe('tapAction', () => {
    it('starts, goes on and plays again like Enter, and does nothing during a run', () => {
        expect(nextScreen('title', tapAction('title')!)).toBe('running');
        expect(nextScreen('paused', tapAction('paused')!)).toBe('running');
        expect(nextScreen('over', tapAction('over')!)).toBe('restart');
        expect(tapAction('running')).toBeNull();
    });
});
