import { AUDIO } from '../config/tuning';
import type { Cue } from '../core/audio/director';

import { MusicLoop } from './music';
import type { VoiceTarget } from './synth';
import { makeNoise, playCue } from './synth';

/** How fast the volume follows mute and unmute, in seconds (a time constant, so there is no click). */
const FADE_SECONDS = 0.03;

interface Graph {
    readonly ctx: AudioContext;
    readonly master: GainNode;
    readonly effects: VoiceTarget;
    readonly music: MusicLoop;
}

/**
 * The game's sound (design: *Audio*): effects and the music loop, all synthesized. Browsers only allow sound after a
 * user gesture, so the audio context is created on the first key press or click; until then every call is a no-op.
 * While muted nothing is scheduled at all. Without Web Audio the game simply stays silent.
 */
export class GameAudio {
    private readonly target: Window;
    private graph: Graph | null = null;
    private mutedNow: boolean;
    private wantMusic = false;
    private tempo: number = AUDIO.musicBeatsPerMinute;
    private readonly lastPlayed = new Map<Cue, number>();

    private readonly unlock = () => {
        this.removeUnlockListeners();
        this.graph = createGraph(this.mutedNow, this.tempo);
        this.syncMusic();
    };

    constructor(target: Window, muted: boolean) {
        this.target = target;
        this.mutedNow = muted;
        target.addEventListener('keydown', this.unlock, { capture: true });
        target.addEventListener('pointerdown', this.unlock, { capture: true });
    }

    get muted(): boolean {
        return this.mutedNow;
    }

    setMuted(muted: boolean): void {
        this.mutedNow = muted;
        if (this.graph) {
            const volume = muted ? 0 : AUDIO.masterVolume;
            this.graph.master.gain.setTargetAtTime(volume, this.graph.ctx.currentTime, FADE_SECONDS);
        }
        this.syncMusic();
    }

    /** Plays a sound effect now; the same effect does not start twice within `AUDIO.repeatGuardSeconds`. */
    play(cue: Cue): void {
        if (!this.graph || this.mutedNow) {
            return;
        }
        const now = this.graph.ctx.currentTime;
        const last = this.lastPlayed.get(cue);
        if (last !== undefined && now - last < AUDIO.repeatGuardSeconds) {
            return;
        }
        this.lastPlayed.set(cue, now);
        playCue(this.graph.effects, cue, now);
    }

    /** Whether the music loop should play (during a run), and at which tempo. Cheap to call every frame. */
    setMusic(playing: boolean, beatsPerMinute: number): void {
        this.tempo = beatsPerMinute;
        this.graph?.music.setTempo(beatsPerMinute);
        if (playing !== this.wantMusic) {
            this.wantMusic = playing;
            this.syncMusic();
        }
    }

    dispose(): void {
        this.removeUnlockListeners();
        this.graph?.music.stop();
        void this.graph?.ctx.close();
        this.graph = null;
    }

    private syncMusic(): void {
        if (!this.graph) {
            return;
        }
        if (this.wantMusic && !this.mutedNow) {
            this.graph.music.start();
        } else {
            this.graph.music.stop();
        }
    }

    private removeUnlockListeners(): void {
        this.target.removeEventListener('keydown', this.unlock, { capture: true });
        this.target.removeEventListener('pointerdown', this.unlock, { capture: true });
    }
}

/** The mixer: effects and music each through their own gain, both into the master gain. */
function createGraph(muted: boolean, beatsPerMinute: number): Graph | null {
    const Context = globalThis.AudioContext as typeof AudioContext | undefined;
    if (!Context) {
        return null;
    }
    let ctx: AudioContext;
    try {
        ctx = new Context();
    } catch {
        return null;
    }
    if (ctx.state === 'suspended') {
        void ctx.resume();
    }
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : AUDIO.masterVolume;
    master.connect(ctx.destination);
    const noise = makeNoise(ctx);
    const effectsGain = ctx.createGain();
    effectsGain.gain.value = AUDIO.effectsVolume;
    effectsGain.connect(master);
    const musicGain = ctx.createGain();
    musicGain.gain.value = AUDIO.musicVolume;
    musicGain.connect(master);
    return {
        ctx,
        master,
        effects: { ctx, out: effectsGain, noise },
        music: new MusicLoop({ ctx, out: musicGain, noise }, beatsPerMinute)
    };
}
