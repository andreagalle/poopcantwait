import { URGENCY, WEIGHT } from '../config/tuning';
import type { Game } from '../core/game';
import { girthTierAt } from '../core/player/weight';
import { isLow } from '../core/urgency/urgency';

import './hud.css';

/** Boxer shorts, the life icon (design: *The protagonist*): mint green with a little banana print. */
const BOXERS_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
<path class="boxers-cloth" d="M15 15 H49 L55 49 H37 L32 34 L27 49 H9 Z"/>
<path class="boxers-band" d="M15 15 H49 L50 22 H14 Z"/>
<path class="boxers-print" d="M18 31 q4 4 8 0 M38 29 q4 4 8 0 M16 41 q4 4 8 0 M41 40 q4 4 8 0"/>
<path class="boxers-stain" d="M26 38 q-6 -4 0 -9 q5 -6 11 0 q6 3 1 8 q-3 6 -12 1 Z"/>
</svg>`;

/** A round tummy with a navel and a rumble swirl, for the urgency gauge. */
const TUMMY_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
<ellipse class="tummy-belly" cx="32" cy="36" rx="22" ry="20"/>
<path class="tummy-navel" d="M30 38 q2 3 4 0"/>
<path class="tummy-rumble" d="M10 14 q4 -6 8 0 q4 6 8 0 M38 12 q4 -6 8 0 q4 6 8 0"/>
</svg>`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement) {
    const el = document.createElement(tag);
    el.className = className;
    parent?.append(el);
    return el;
}

/** Gauge colour from green (plenty of time) through yellow to red (empty). */
export function gaugeColor(share: number): string {
    const s = Math.min(1, Math.max(0, share));
    const hue = Math.round(120 * s);
    return `hsl(${hue} 70% 48%)`;
}

/**
 * The heads-up display (design: *HUD and screens*), an HTML overlay above the canvas rendered from the game state each
 * frame. The DOM is only touched when a shown value changes.
 */
export class Hud {
    readonly root: HTMLElement;
    private readonly gauge: HTMLElement;
    private readonly seconds: HTMLElement;
    private readonly bar: HTMLElement;
    private readonly score: HTMLElement;
    private readonly combo: HTMLElement;
    private readonly underpants: HTMLElement[];
    private readonly weightFill: HTMLElement;
    private readonly tier: HTMLElement;
    private readonly shown = new Map<string, string>();

    constructor(parent: HTMLElement) {
        this.root = element('div', 'hud', parent);

        this.gauge = element('div', 'hud-gauge', this.root);
        this.gauge.setAttribute('aria-label', 'Time left');
        element('span', 'hud-tummy', this.gauge).innerHTML = TUMMY_SVG;
        this.seconds = element('span', 'hud-seconds', this.gauge);
        const track = element('span', 'hud-bar', this.gauge);
        this.bar = element('span', 'hud-bar-fill', track);

        const centre = element('div', 'hud-score-box', this.root);
        this.score = element('span', 'hud-score', centre);
        this.combo = element('span', 'hud-combo', centre);

        const lives = element('div', 'hud-underpants', this.root);
        lives.setAttribute('aria-label', 'Underpants');
        this.underpants = Array.from({ length: URGENCY.underpants }, () => {
            const icon = element('span', 'underpants', lives);
            icon.innerHTML = BOXERS_SVG;
            return icon;
        });

        const weight = element('div', 'hud-weight', this.root);
        weight.setAttribute('aria-label', 'Weight');
        this.tier = element('span', 'hud-tier', weight);
        const weightTrack = element('span', 'hud-weight-bar', weight);
        this.weightFill = element('span', 'hud-weight-fill', weightTrack);
        // Where each girth tier ends, as ticks on the weight bar
        for (const tier of WEIGHT.tiers.slice(0, -1)) {
            const tick = element('span', 'hud-weight-tick', weightTrack);
            tick.style.left = `${tier.maxWeight * 100}%`;
        }
    }

    /** Sets a property only when its value changed since the last frame. */
    private set(key: string, value: string, apply: (value: string) => void): void {
        if (this.shown.get(key) !== value) {
            this.shown.set(key, value);
            apply(value);
        }
    }

    update(game: Game): void {
        const { urgency, player } = game;
        const score = game.score.points;
        const combo = game.score.multiplier;
        const share = urgency.secondsLeft / urgency.countdownSeconds;
        this.set('seconds', String(Math.ceil(urgency.secondsLeft)), (v) => (this.seconds.textContent = v));
        this.set('bar', share.toFixed(3), (v) => {
            this.bar.style.width = `${Number(v) * 100}%`;
            this.bar.style.background = gaugeColor(Number(v));
        });
        this.set('low', String(isLow(urgency)), (v) => this.gauge.classList.toggle('is-low', v === 'true'));

        this.set('score', String(score), (v) => (this.score.textContent = v));
        this.set('combo', combo > 1 ? `×${combo.toFixed(1)}` : '', (v) => {
            this.combo.textContent = v;
            this.combo.hidden = v === '';
        });

        const soiled = URGENCY.underpants - urgency.cleanUnderpants;
        this.set('underpants', String(soiled), (v) => {
            this.underpants.forEach((icon, i) =>
                icon.classList.toggle('is-soiled', i >= URGENCY.underpants - Number(v))
            );
        });

        this.set('weight', player.weight.toFixed(3), (v) => (this.weightFill.style.width = `${Number(v) * 100}%`));
        this.set('tier', girthTierAt(player.weight), (v) => (this.tier.textContent = v));
    }
}
