import type { Screen } from '../core/flow';

import { loadHighScores } from './high-score-store';

import './screens.css';

const MUTE_KEY = 'gotta-go.muted';

/** Whether sound is muted, as remembered in this browser (the game works without storage). */
export function loadMuted(): boolean {
    try {
        return window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
        return false;
    }
}

export function saveMuted(muted: boolean): void {
    try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
        // Storage refused: the choice lasts for this page only
    }
}

function panel(className: string, label: string, html: string): HTMLElement {
    const el = document.createElement('section');
    el.className = `screen ${className}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', label);
    el.innerHTML = html;
    el.hidden = true;
    return el;
}

/** How to play, with the keys on a computer and with a finger on a phone or a tablet (design: *Controls*). */
const KEY_CONTROLS = `<li><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> run (two at once for diagonals)</li>
<li>Eat junk food for points, dodge vegetables, follow the green signs to a free toilet</li>
<li><kbd>Esc</kbd> or <kbd>P</kbd> pause · <kbd>M</kbd> mute</li>`;

const TOUCH_CONTROLS = `<li>Drag anywhere to run: Benny goes the way your finger points</li>
<li>Eat junk food for points, dodge vegetables, follow the green signs to a free toilet</li>
<li>Pause and mute with the buttons in the corner</li>`;

/**
 * The title and pause screens and the mute badge, shown over the city. On a touch-only device (`touchOnly`) they speak
 * of taps and drags instead of keys; a keyboard plugged into it still works.
 */
export class Screens {
    private readonly title: HTMLElement;
    private readonly pause: HTMLElement;
    private readonly mute: HTMLElement;

    constructor(parent: HTMLElement, touchOnly = false) {
        const best = loadHighScores()[0];
        this.title = panel(
            touchOnly ? 'screen-title is-touch' : 'screen-title',
            'Title',
            `<h1>Gotta Go!</h1>
<p class="screen-tagline">Benny really has to go. Get him to a free toilet before it is too late.</p>
<ul class="screen-controls">
${touchOnly ? TOUCH_CONTROLS : KEY_CONTROLS}
</ul>
${best ? `<p class="screen-best">Best score ${best}</p>` : ''}
<p class="screen-start">${touchOnly ? 'Tap to start' : 'Press <kbd>Enter</kbd> or <kbd>Space</kbd> to start'}</p>`
        );
        this.pause = panel(
            'screen-pause',
            'Paused',
            `<h2>Paused</h2><p>${touchOnly ? 'Tap to go on' : 'Press <kbd>Esc</kbd> or <kbd>P</kbd> to go on'}</p>`
        );
        this.mute = document.createElement('p');
        this.mute.className = 'mute-badge';
        this.mute.textContent = 'Muted (M)';
        this.mute.hidden = true;
        parent.append(this.title, this.pause, this.mute);
    }

    show(screen: Screen): void {
        this.title.hidden = screen !== 'title';
        this.pause.hidden = screen !== 'paused';
    }

    showMuted(muted: boolean): void {
        this.mute.hidden = !muted;
    }
}
