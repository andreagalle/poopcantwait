import { URGENCY } from '../config/tuning';
import type { Game } from '../core/game';
import type { WeightMarker } from '../core/player/markers';
import { passed, weightMarkers } from '../core/player/markers';
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

/** What each weight marker says, and what it means once passed (for screen readers and the tooltip). */
const MARKER_TEXT: Readonly<Record<WeightMarker['id'], { label: string; passed: string; ahead: string }>> = {
    alleys: { label: 'alleys', passed: 'Too wide for alleys', ahead: 'Alleys stop fitting here' },
    streets: { label: 'streets', passed: 'Too wide for streets', ahead: 'Streets stop fitting here' },
    cars: { label: 'cars', passed: 'Heavy enough to crumple cars', ahead: 'Cars crumple from here' },
    buses: { label: 'buses', passed: 'Heavy enough to crumple buses', ahead: 'Buses crumple from here' }
};

/** Short "something changed" animations on HUD parts (skipped when the system asks for reduced motion). */
const BUMPS = {
    score: { keyframes: [{ scale: 1 }, { scale: 1.25 }, { scale: 1 }], duration: 250 },
    combo: { keyframes: [{ scale: 1 }, { scale: 1.45 }, { scale: 1 }], duration: 300 },
    soiled: {
        keyframes: [
            { scale: 1, rotate: '0deg' },
            { scale: 1.35, rotate: '-14deg' },
            { scale: 1.2, rotate: '12deg' },
            { scale: 1, rotate: '0deg' }
        ],
        duration: 600
    },
    tier: { keyframes: [{ scale: 1 }, { scale: 1.3, color: '#e65100' }, { scale: 1 }], duration: 500 }
} satisfies Record<string, { keyframes: Keyframe[]; duration: number }>;

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
    private readonly markers: { marker: WeightMarker; label: HTMLElement; tick: HTMLElement }[];
    private readonly shown = new Map<string, string>();
    private readonly reducedMotion: boolean;

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
        // The bar, with where alleys and streets stop fitting above it and where vehicles start crumpling below it
        const scale = element('span', 'hud-weight-scale', weight);
        const above = element('span', 'hud-weight-labels is-fit', scale);
        const weightTrack = element('span', 'hud-weight-bar', scale);
        const below = element('span', 'hud-weight-labels is-crush', scale);
        this.weightFill = element('span', 'hud-weight-fill', weightTrack);
        this.markers = weightMarkers().map((marker) => {
            const tick = element('span', `hud-weight-tick is-${marker.kind}`, weightTrack);
            tick.style.left = `${marker.weight * 100}%`;
            const label = element('span', `hud-weight-marker is-${marker.kind}`, marker.kind === 'fit' ? above : below);
            label.style.left = `${marker.weight * 100}%`;
            label.textContent = MARKER_TEXT[marker.id].label;
            label.dataset.marker = marker.id;
            return { marker, label, tick };
        });
        this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    }

    private bump(el: Element, which: keyof typeof BUMPS): void {
        if (!this.reducedMotion && typeof el.animate === 'function') {
            el.animate(BUMPS[which].keyframes, { duration: BUMPS[which].duration, easing: 'ease-out' });
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

        this.set('score', String(score), (v) => {
            const gained = Number(v) > Number(this.score.textContent || 0);
            this.score.textContent = v;
            if (gained) {
                this.bump(this.score, 'score');
            }
        });
        this.set('combo', combo > 1 ? `×${combo.toFixed(1)}` : '', (v) => {
            this.combo.textContent = v;
            this.combo.hidden = v === '';
            if (v !== '') {
                this.bump(this.combo, 'combo');
            }
        });

        const soiled = URGENCY.underpants - urgency.cleanUnderpants;
        this.set('underpants', String(soiled), (v) => {
            this.underpants.forEach((icon, i) => {
                const now = i >= URGENCY.underpants - Number(v);
                if (now && !icon.classList.contains('is-soiled')) {
                    this.bump(icon, 'soiled');
                }
                icon.classList.toggle('is-soiled', now);
            });
        });

        this.set('weight', player.weight.toFixed(3), (v) => {
            this.weightFill.style.width = `${Number(v) * 100}%`;
            for (const { marker, label, tick } of this.markers) {
                const done = passed(marker, Number(v));
                label.classList.toggle('is-passed', done);
                tick.classList.toggle('is-passed', done);
                label.title = MARKER_TEXT[marker.id][done ? 'passed' : 'ahead'];
            }
        });
        this.set('tier', girthTierAt(player.weight), (v) => {
            const changed = this.tier.textContent !== '' && this.tier.textContent !== v;
            this.tier.textContent = v;
            if (changed) {
                this.bump(this.tier, 'tier');
            }
        });
    }
}
