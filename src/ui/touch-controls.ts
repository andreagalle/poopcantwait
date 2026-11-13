import { TOUCH } from '../config/tuning';
import type { Screen } from '../core/flow';
import type { MenuAction } from '../input/keyboard';
import type { TouchStick } from '../input/touch';

import './touch.css';

const PAUSE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>`;
const SOUND_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="touch-waves" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke-width="2" stroke-linecap="round"/><path class="touch-cross" d="M16 9l5 6M21 9l-5 6" fill="none" stroke-width="2.2" stroke-linecap="round"/></svg>`;

function button(className: string, label: string, icon: string, onPress: () => void): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `touch-button ${className}`;
    el.setAttribute('aria-label', label);
    el.innerHTML = icon;
    el.addEventListener('click', onPress);
    return el;
}

/**
 * What a touchscreen shows (design: *Controls*): the floating stick under the steering finger, and buttons to pause
 * (during the run) and to mute (always), in the bottom right corner where a thumb reaches them.
 */
export class TouchControls {
    private readonly stick: HTMLElement;
    private readonly knob: HTMLElement;
    private readonly pause: HTMLButtonElement;
    private readonly mute: HTMLButtonElement;

    constructor(parent: HTMLElement, onAction: (action: MenuAction) => void) {
        parent.classList.add('has-touch');
        this.stick = document.createElement('div');
        this.stick.className = 'touch-stick';
        this.stick.style.setProperty('--stick-radius', `${TOUCH.stickRadiusPixels}px`);
        this.stick.hidden = true;
        this.knob = document.createElement('div');
        this.knob.className = 'touch-knob';
        this.stick.append(this.knob);

        const bar = document.createElement('div');
        bar.className = 'touch-buttons';
        this.mute = button('touch-mute', 'Mute', SOUND_ICON, () => onAction('mute'));
        this.pause = button('touch-pause', 'Pause', PAUSE_ICON, () => onAction('pause'));
        bar.append(this.mute, this.pause);
        parent.append(this.stick, bar);
    }

    /** Draws the stick where the finger steers, and shows the pause button only during the run. */
    update(stick: TouchStick | null, screen: Screen): void {
        this.stick.hidden = stick === null;
        if (stick) {
            this.stick.style.translate = `${stick.centre.x}px ${stick.centre.y}px`;
            this.knob.style.translate = `${stick.finger.x - stick.centre.x}px ${stick.finger.y - stick.centre.y}px`;
        }
        this.pause.hidden = screen !== 'running';
    }

    showMuted(muted: boolean): void {
        this.mute.setAttribute('aria-pressed', String(muted));
    }
}
