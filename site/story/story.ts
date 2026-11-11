/**
 * The story page: finds the stage in the middle of the screen, reveals it, and moves the HUD to that point of the
 * development (time since the kickoff, merged PRs, the human's messages, the agent's actions, finished milestones).
 * Every number comes from the stage's data-* attributes; without JavaScript the stages read the same, minus the HUD.
 */

interface StageState {
    readonly kind: string;
    readonly when: string;
    readonly minutes: number;
    readonly human: number;
    readonly agent: number;
    readonly prs: number;
    readonly phase: string;
    readonly done: readonly string[];
}

const MILESTONES = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'];
const COUNT_MS = 700;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.add('js');

const stages = Array.from(document.querySelectorAll<HTMLElement>('.stage'));

/** "h:mm" since the kickoff to minutes. */
function toMinutes(text: string): number {
    const [hours = 0, minutes = 0] = text.split(':').map(Number);
    return hours * 60 + minutes;
}

function readStage(stage: HTMLElement): StageState {
    const data = stage.dataset;
    let kind = data.kind ?? 'agent';
    if (stage.classList.contains('stage--human')) {
        kind = 'human';
    }
    return {
        kind,
        when: data.when ?? '',
        minutes: toMinutes(data.t ?? '0:00'),
        human: Number(data.human ?? 0),
        agent: Number(data.agent ?? 0),
        prs: Number(data.prs ?? 0),
        phase: data.phase ?? '',
        done: (data.done ?? '').split(/\s+/).filter(Boolean)
    };
}

const states = stages.map(readStage);
const totalMinutes = Math.max(1, ...states.map((state) => state.minutes));
const totalHuman = Number(document.body.dataset.humanTotal ?? 0);

function find<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) {
        throw new Error(`story: missing ${selector}`);
    }
    return element;
}

const hud = {
    t: find<HTMLElement>('.hud-t'),
    when: find<HTMLElement>('.hud-when'),
    bar: find<HTMLElement>('.hud-bar-fill'),
    prs: find<HTMLElement>('.hud-prs-n'),
    human: find<HTMLElement>('.hud-human-n'),
    agent: find<HTMLElement>('.hud-agent-n'),
    phase: find<HTMLElement>('.hud-phase-name'),
    pips: find<HTMLElement>('.hud-pips'),
    milestones: find<HTMLElement>('.hud-milestones')
};

const pips = Array.from({ length: totalHuman }, () => {
    const pip = document.createElement('span');
    pip.className = 'pip';
    hud.pips.append(pip);
    return pip;
});

const segments = MILESTONES.map((name) => {
    const segment = document.createElement('span');
    segment.className = 'seg';
    segment.textContent = name;
    hud.milestones.append(segment);
    return segment;
});

// Stagger the facts and chat lines of each stage
for (const list of document.querySelectorAll('.facts, .chat')) {
    Array.from(list.children).forEach((item, index) => (item as HTMLElement).style.setProperty('--i', String(index)));
}

// The human's share of the conversation, drawn to scale
for (const ratio of document.querySelectorAll<HTMLElement>('.ratio')) {
    const human = Number(ratio.dataset.human ?? 0);
    const agent = Number(ratio.dataset.agent ?? 0);
    if (human + agent > 0) {
        ratio.style.setProperty('--human-share', `${((100 * human) / (human + agent)).toFixed(2)}%`);
    }
}

// One dot per stage, to see where you are and jump
const dotNav = find<HTMLElement>('.dots');
const dots = stages.map((stage, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `dot dot--${states[index].kind}`;
    const title = stage.querySelector('h1, h2, blockquote')?.textContent?.trim() ?? stage.id;
    dot.setAttribute('aria-label', `Stage ${index + 1}: ${title}`);
    dot.title = title;
    dot.addEventListener('click', () => stage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }));
    dotNav.append(dot);
    return dot;
});

/** Numbers shown in the HUD, animated from what they show now to the stage's values. */
const shown = { minutes: 0, prs: 0, human: 0, agent: 0 };
let animation = 0;

function formatClock(minutes: number): string {
    const rounded = Math.round(minutes);
    return `T+${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function paintNumbers(): void {
    hud.t.textContent = formatClock(shown.minutes);
    hud.prs.textContent = String(Math.round(shown.prs));
    hud.human.textContent = String(Math.round(shown.human));
    hud.agent.textContent = Math.round(shown.agent).toLocaleString('en-US');
}

function countTo(target: StageState): void {
    cancelAnimationFrame(animation);
    const from = { ...shown };
    const to = { minutes: target.minutes, prs: target.prs, human: target.human, agent: target.agent };
    if (reduceMotion) {
        Object.assign(shown, to);
        paintNumbers();
        return;
    }
    const start = performance.now();
    const step = (now: number): void => {
        const k = Math.min(1, (now - start) / COUNT_MS);
        const eased = 1 - (1 - k) ** 3;
        shown.minutes = from.minutes + (to.minutes - from.minutes) * eased;
        shown.prs = from.prs + (to.prs - from.prs) * eased;
        shown.human = from.human + (to.human - from.human) * eased;
        shown.agent = from.agent + (to.agent - from.agent) * eased;
        paintNumbers();
        if (k < 1) {
            animation = requestAnimationFrame(step);
        }
    };
    animation = requestAnimationFrame(step);
}

let current = -1;

function activate(index: number): void {
    if (index === current) {
        return;
    }
    current = index;
    const state = states[index];
    stages.forEach((stage, i) => stage.classList.toggle('is-active', i === index));
    stages[index].classList.add('is-seen');
    document.body.classList.toggle('at-cover', state.kind === 'cover');

    hud.when.textContent = state.when;
    hud.phase.textContent = state.phase;
    hud.bar.style.width = `${(100 * state.minutes) / totalMinutes}%`;
    pips.forEach((pip, i) => pip.classList.toggle('on', i < state.human));
    segments.forEach((segment, i) => {
        const name = MILESTONES[i];
        segment.classList.toggle('done', state.done.includes(name));
        segment.classList.toggle('partial', state.done.includes(`${name}~`));
    });
    dots.forEach((dot, i) => {
        if (i === index) {
            dot.setAttribute('aria-current', 'step');
        } else {
            dot.removeAttribute('aria-current');
        }
    });
    countTo(state);

    const hash = index === 0 ? '' : `#${stages[index].id}`;
    if (window.location.hash !== hash) {
        history.replaceState(null, '', hash || window.location.pathname + window.location.search);
    }
}

/** The stage that crosses the middle of the screen. */
function stageAtCenter(): number {
    const middle = window.innerHeight / 2;
    let found = 0;
    stages.forEach((stage, index) => {
        if (stage.getBoundingClientRect().top <= middle) {
            found = index;
        }
    });
    return found;
}

let queued = false;
function onScroll(): void {
    if (queued) {
        return;
    }
    queued = true;
    requestAnimationFrame(() => {
        queued = false;
        activate(stageAtCenter());
    });
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);

// A link to a stage (from a side story, or shared) opens on it: go there before activating, or the first activation
// would rewrite the address to the top stage before the browser scrolls to the anchor
const linked = stages.findIndex((stage) => window.location.hash === `#${stage.id}`);
if (linked > 0) {
    stages[linked].scrollIntoView({ behavior: 'auto' });
    activate(linked);
} else {
    activate(stageAtCenter());
}
