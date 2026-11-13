import { describe, expect, it } from 'vitest';

import { TOUCH } from '../config/tuning';

import { combineDirections, dragDirection, followFinger, TouchInput } from './touch';

const D = Math.SQRT1_2;

describe('dragDirection', () => {
    it('leaves Benny standing inside the dead zone', () => {
        expect(dragDirection(0, 0)).toEqual({ x: 0, z: 0 });
        expect(dragDirection(TOUCH.deadZonePixels - 1, 0)).toEqual({ x: 0, z: 0 });
        expect(dragDirection(TOUCH.deadZonePixels, 0)).toEqual({ x: 1, z: 0 });
    });

    it('maps a drag to the arrow keys, screen-relative: up the screen is -z, right is +x', () => {
        expect(dragDirection(0, -40)).toEqual({ x: 0, z: -1 });
        expect(dragDirection(0, 40)).toEqual({ x: 0, z: 1 });
        expect(dragDirection(-40, 0)).toEqual({ x: -1, z: 0 });
        expect(dragDirection(40, 0)).toEqual({ x: 1, z: 0 });
    });

    it('picks the nearest of eight directions, diagonals as fast as with two keys', () => {
        const right = dragDirection(40, 15);
        expect(right).toEqual({ x: 1, z: 0 });
        const downRight = dragDirection(40, 25);
        expect(downRight.x).toBeCloseTo(D);
        expect(downRight.z).toBeCloseTo(D);
        const upLeft = dragDirection(-30, -32);
        expect(upLeft.x).toBeCloseTo(-D);
        expect(upLeft.z).toBeCloseTo(-D);
        expect(Math.hypot(upLeft.x, upLeft.z)).toBeCloseTo(1);
    });

    it('gives only the eight key directions over a full turn', () => {
        const seen = new Set<string>();
        for (let degrees = 0; degrees < 360; degrees += 3) {
            const a = (degrees * Math.PI) / 180;
            const d = dragDirection(50 * Math.cos(a), 50 * Math.sin(a));
            seen.add(`${Math.sign(d.x)},${Math.sign(d.z)}`);
        }
        expect(seen.size).toBe(8);
    });
});

describe('followFinger', () => {
    it('keeps the centre while the finger stays within the radius', () => {
        const centre = { x: 100, y: 100 };
        expect(followFinger(centre, { x: 130, y: 100 }, 56)).toBe(centre);
    });

    it('pulls the centre along to stay one radius behind the finger', () => {
        const centre = followFinger({ x: 100, y: 100 }, { x: 300, y: 100 }, 56);
        expect(centre.x).toBeCloseTo(244);
        expect(centre.y).toBeCloseTo(100);
    });
});

describe('combineDirections', () => {
    it('lets a steering finger win over the keys', () => {
        expect(combineDirections({ x: 1, z: 0 }, { x: 0, z: -1 })).toEqual({ x: 0, z: -1 });
        expect(combineDirections({ x: 1, z: 0 }, { x: 0, z: 0 })).toEqual({ x: 1, z: 0 });
    });
});

/** A window stand-in: pointer events with only the fields the input reads. */
function pointer(target: EventTarget, type: string, id: number, x: number, y: number, pointerType = 'touch') {
    target.dispatchEvent(Object.assign(new Event(type), { pointerId: id, clientX: x, clientY: y, pointerType }));
}

describe('TouchInput', () => {
    function setup(running: boolean) {
        const target = new EventTarget();
        const state = { running, taps: 0 };
        const input = new TouchInput(
            target as unknown as Window,
            () => state.running,
            () => state.taps++
        );
        return { target, state, input };
    }

    it('steers with the first finger while the run is on, and stops when it lifts', () => {
        const { target, input } = setup(true);
        pointer(target, 'pointerdown', 1, 200, 300);
        expect(input.direction()).toEqual({ x: 0, z: 0 });
        pointer(target, 'pointermove', 1, 200, 240);
        expect(input.direction()).toEqual({ x: 0, z: -1 });
        expect(input.stick()?.finger).toEqual({ x: 200, y: 240 });
        // A second finger does not take over
        pointer(target, 'pointerdown', 2, 50, 50);
        pointer(target, 'pointermove', 2, 150, 50);
        expect(input.direction()).toEqual({ x: 0, z: -1 });
        pointer(target, 'pointerup', 1, 200, 240);
        expect(input.direction()).toEqual({ x: 0, z: 0 });
        expect(input.stick()).toBeNull();
    });

    it('taps on the other screens, but not with the finger that was steering when the run ended', () => {
        const { target, state } = setup(true);
        pointer(target, 'pointerdown', 1, 200, 300);
        state.running = false;
        pointer(target, 'pointerup', 1, 200, 300);
        expect(state.taps).toBe(0);
        pointer(target, 'pointerdown', 2, 100, 100);
        pointer(target, 'pointerup', 2, 100, 100);
        expect(state.taps).toBe(1);
        // A cancelled touch (the browser took it) is no tap
        pointer(target, 'pointerdown', 3, 100, 100);
        pointer(target, 'pointercancel', 3, 100, 100);
        expect(state.taps).toBe(1);
    });

    it('leaves the mouse to the keyboard controls', () => {
        const { target, input, state } = setup(true);
        pointer(target, 'pointerdown', 1, 200, 300, 'mouse');
        pointer(target, 'pointermove', 1, 300, 300, 'mouse');
        expect(input.direction()).toEqual({ x: 0, z: 0 });
        state.running = false;
        pointer(target, 'pointerdown', 1, 200, 300, 'mouse');
        pointer(target, 'pointerup', 1, 200, 300, 'mouse');
        expect(state.taps).toBe(0);
    });

    it('lets go of everything when the window loses focus', () => {
        const { target, input } = setup(true);
        pointer(target, 'pointerdown', 1, 200, 300);
        pointer(target, 'pointermove', 1, 260, 300);
        target.dispatchEvent(new Event('blur'));
        expect(input.direction()).toEqual({ x: 0, z: 0 });
        input.dispose();
    });
});
