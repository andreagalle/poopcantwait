import type { Cue } from '../core/audio/director';
import { Rng } from '../core/rng';

/**
 * Every sound effect, synthesized with the Web Audio API (design: *Audio*): oscillators and filtered noise shaped by
 * short envelopes. Nothing is downloaded and nothing here is sampled from anyone else's work. The frequencies and
 * timings below are sound design, not gameplay; the volumes the player hears are set in `AUDIO` (tuning).
 */

/** Seed of the shared white-noise buffer, so the noise is the same on every run. */
const NOISE_SEED = 0x6e6f6973;
const NOISE_SECONDS = 1;

/** One second of white noise, made once per audio context and shared by every noisy voice. */
export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const rng = new Rng(NOISE_SEED);
    for (let i = 0; i < data.length; i++) {
        data[i] = rng.range(-1, 1);
    }
    return buffer;
}

/** The note frequency, in hertz, of a MIDI note number (69 is A4, 440 Hz). */
export function midiToHz(note: number): number {
    return 440 * 2 ** ((note - 69) / 12);
}

/** Where a voice plays: the context, the node it feeds and the shared noise. */
export interface VoiceTarget {
    readonly ctx: BaseAudioContext;
    readonly out: AudioNode;
    readonly noise: AudioBuffer;
}

/** A gain node with a quick attack to `peak` and an exponential fall over `duration` seconds from `at`. */
function envelope(target: VoiceTarget, at: number, duration: number, peak: number, attack = 0.005): GainNode {
    const gain = target.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    gain.connect(target.out);
    return gain;
}

interface ToneOptions {
    readonly type: OscillatorType;
    readonly from: number;
    readonly to?: number;
    readonly at: number;
    readonly duration: number;
    readonly peak: number;
    readonly attack?: number;
    /** A lowpass filter on the tone, in hertz. */
    readonly lowpass?: number;
    /** Vibrato: rate in hertz and depth in hertz. */
    readonly vibrato?: { readonly rate: number; readonly depth: number };
}

/** One oscillator, gliding from `from` to `to` hertz. */
function tone(target: VoiceTarget, o: ToneOptions): void {
    const { ctx } = target;
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.from, o.at);
    if (o.to !== undefined && o.to !== o.from) {
        osc.frequency.exponentialRampToValueAtTime(o.to, o.at + o.duration);
    }
    const gain = envelope(target, o.at, o.duration, o.peak, o.attack);
    if (o.lowpass) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = o.lowpass;
        osc.connect(filter).connect(gain);
    } else {
        osc.connect(gain);
    }
    if (o.vibrato) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = o.vibrato.rate;
        depth.gain.value = o.vibrato.depth;
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(o.at);
        lfo.stop(o.at + o.duration + 0.05);
    }
    osc.start(o.at);
    osc.stop(o.at + o.duration + 0.05);
}

interface NoiseOptions {
    readonly at: number;
    readonly duration: number;
    readonly peak: number;
    readonly filter: BiquadFilterType;
    readonly from: number;
    readonly to?: number;
    readonly q?: number;
    readonly attack?: number;
    /** Where to start reading the noise buffer, in seconds, so overlapping bursts do not sound identical. */
    readonly offset?: number;
}

/** A burst of filtered noise, the filter gliding from `from` to `to` hertz. */
function noise(target: VoiceTarget, o: NoiseOptions): void {
    const { ctx } = target;
    const source = ctx.createBufferSource();
    source.buffer = target.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter;
    filter.Q.value = o.q ?? 1;
    filter.frequency.setValueAtTime(o.from, o.at);
    if (o.to !== undefined && o.to !== o.from) {
        filter.frequency.exponentialRampToValueAtTime(o.to, o.at + o.duration);
    }
    source.connect(filter).connect(envelope(target, o.at, o.duration, o.peak, o.attack));
    source.start(o.at, o.offset ?? 0);
    source.stop(o.at + o.duration + 0.05);
}

/** Two quick bites: a crunchy noise snap over a falling square "nom". */
function chomp(t: VoiceTarget, at: number): void {
    for (const [i, offset] of [0, 0.1].entries()) {
        noise(t, {
            at: at + offset,
            duration: 0.07,
            peak: 0.75,
            filter: 'bandpass',
            from: 2200,
            to: 800,
            q: 2,
            offset: i * 0.3
        });
        tone(t, { type: 'square', from: 340, to: 150, at: at + offset, duration: 0.07, peak: 0.2, lowpass: 1800 });
    }
}

/** A disgusted, wobbly "eww" sliding down. */
function ew(t: VoiceTarget, at: number): void {
    const vibrato = { rate: 9, depth: 18 };
    tone(t, {
        type: 'sawtooth',
        from: 560,
        to: 250,
        at,
        duration: 0.55,
        peak: 0.3,
        attack: 0.04,
        lowpass: 1500,
        vibrato
    });
    tone(t, { type: 'triangle', from: 840, to: 375, at, duration: 0.55, peak: 0.15, attack: 0.04, vibrato });
}

/** A low, gurgling tummy rumble. */
function rumble(t: VoiceTarget, at: number): void {
    tone(t, {
        type: 'triangle',
        from: 75,
        to: 48,
        at,
        duration: 0.8,
        peak: 0.55,
        attack: 0.06,
        vibrato: { rate: 11, depth: 9 }
    });
    noise(t, { at, duration: 0.7, peak: 0.3, filter: 'lowpass', from: 260, to: 120, q: 4, attack: 0.08, offset: 0.5 });
    tone(t, { type: 'sine', from: 160, to: 260, at: at + 0.35, duration: 0.12, peak: 0.15 });
}

/** A rushing flush, swirling down, with a few gurgles at the end. */
function flush(t: VoiceTarget, at: number): void {
    noise(t, { at, duration: 1.5, peak: 0.45, filter: 'bandpass', from: 1400, to: 220, q: 1.4, attack: 0.18 });
    noise(t, {
        at: at + 0.1,
        duration: 1.2,
        peak: 0.2,
        filter: 'highpass',
        from: 3000,
        to: 1200,
        attack: 0.1,
        offset: 0.4
    });
    for (const offset of [0.9, 1.08, 1.3]) {
        tone(t, { type: 'sine', from: 260, to: 620, at: at + offset, duration: 0.09, peak: 0.18 });
    }
}

/** Crumpling metal: a heavy thump under a run of crackles. */
function crunch(t: VoiceTarget, at: number): void {
    tone(t, { type: 'sine', from: 130, to: 40, at, duration: 0.3, peak: 0.45 });
    for (const [i, offset] of [0, 0.035, 0.08, 0.14, 0.21, 0.3].entries()) {
        noise(t, {
            at: at + offset,
            duration: 0.06,
            peak: 0.55 - i * 0.07,
            filter: 'highpass',
            from: 1200 + i * 300,
            q: 3,
            offset: i * 0.13
        });
    }
}

/** A short cartoon "beep beep" on a major third. */
function horn(t: VoiceTarget, at: number): void {
    for (const offset of [0, 0.17]) {
        tone(t, {
            type: 'square',
            from: 415,
            at: at + offset,
            duration: 0.13,
            peak: 0.12,
            attack: 0.01,
            lowpass: 2200
        });
        tone(t, { type: 'square', from: 523, at: at + offset, duration: 0.13, peak: 0.1, attack: 0.01, lowpass: 2200 });
    }
}

/** The accident: a sad, descending four-note brass sting, the last one wobbling. */
function sting(t: VoiceTarget, at: number): void {
    const notes = [67, 66, 65, 64];
    const step = 0.3;
    notes.forEach((note, i) => {
        const last = i === notes.length - 1;
        tone(t, {
            type: 'sawtooth',
            from: midiToHz(note),
            at: at + i * step,
            duration: last ? 0.95 : step * 0.9,
            peak: 0.22,
            attack: 0.03,
            lowpass: 1100,
            vibrato: last ? { rate: 6, depth: 10 } : undefined
        });
    });
}

/** Knocked over by a vehicle: a hollow bonk falling away. */
function bonk(t: VoiceTarget, at: number): void {
    tone(t, { type: 'sine', from: 560, to: 90, at, duration: 0.28, peak: 0.55 });
    tone(t, { type: 'triangle', from: 1120, to: 300, at, duration: 0.08, peak: 0.15 });
    noise(t, { at, duration: 0.04, peak: 0.3, filter: 'bandpass', from: 2500, q: 1, offset: 0.2 });
}

const VOICES: Readonly<Record<Cue, (target: VoiceTarget, at: number) => void>> = {
    chomp,
    ew,
    rumble,
    flush,
    crunch,
    horn,
    sting,
    bonk
};

/** Schedules a sound effect at `at` seconds of audio-context time. */
export function playCue(target: VoiceTarget, cue: Cue, at: number): void {
    VOICES[cue](target, at);
}

/** One music note: a staccato pluck, used by the music loop. */
export function pluck(
    target: VoiceTarget,
    type: OscillatorType,
    note: number,
    at: number,
    duration: number,
    peak: number
): void {
    tone(target, { type, from: midiToHz(note), at, duration, peak, attack: 0.01, lowpass: 2400 });
}

/** A closed hi-hat tick, used by the music loop. */
export function tick(target: VoiceTarget, at: number, peak: number): void {
    noise(target, { at, duration: 0.04, peak, filter: 'highpass', from: 7000, q: 0.7, attack: 0.002, offset: 0.7 });
}
