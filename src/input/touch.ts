import { TOUCH } from '../config/tuning';
import type { MoveInput } from '../core/player/movement';

/** A point on the screen, in CSS pixels (y grows down). */
export interface ScreenPoint {
    readonly x: number;
    readonly y: number;
}

/** The floating stick while a finger steers: where its centre is and where the finger is. */
export interface TouchStick {
    readonly centre: ScreenPoint;
    readonly finger: ScreenPoint;
}

const STILL: MoveInput = { x: 0, z: 0 };

/**
 * The arrow-key direction nearest to a drag (design: *Controls*): one of eight, exactly as the keys give it (diagonals
 * normalised the same way), or none inside the dead zone. Screen-relative like the keys: dragging up the screen moves
 * Benny up the screen (-z), dragging right moves him right (+x).
 */
export function dragDirection(dx: number, dy: number, deadZone: number = TOUCH.deadZonePixels): MoveInput {
    if (Math.hypot(dx, dy) < deadZone) {
        return STILL;
    }
    const eighth = Math.PI / 4;
    const angle = Math.round(Math.atan2(dy, dx) / eighth) * eighth;
    const x = Math.round(Math.cos(angle));
    const z = Math.round(Math.sin(angle));
    const length = Math.hypot(x, z);
    return { x: x / length, z: z / length };
}

/** The stick's centre after the finger moved: it stays put within `radius` and is pulled along beyond it. */
export function followFinger(
    centre: ScreenPoint,
    finger: ScreenPoint,
    radius: number = TOUCH.stickRadiusPixels
): ScreenPoint {
    const dx = finger.x - centre.x;
    const dy = finger.y - centre.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= radius) {
        return centre;
    }
    const k = (distance - radius) / distance;
    return { x: centre.x + dx * k, y: centre.y + dy * k };
}

/** Taps and drags on buttons and links are theirs, not the game's. */
function isControl(target: EventTarget | null): boolean {
    const element = target as { closest?: (selectors: string) => unknown } | null;
    return typeof element?.closest === 'function' && element.closest('a, button') !== null;
}

/**
 * Touch controls (design: *Controls*). While the run is on screen (`canSteer`), the first finger down anywhere steers
 * Benny like a floating stick; on the other screens, a finger that goes down and up again on the same screen is a tap
 * (`onTap`), so the finger that was steering when a run ends does not start the next one. Mouse pointers are left to
 * the keyboard controls, so a computer plays as before.
 */
export class TouchInput {
    private steering: { readonly id: number; centre: ScreenPoint; finger: ScreenPoint } | null = null;
    private tapping: number | null = null;
    private readonly target: Window;
    private readonly canSteer: () => boolean;
    private readonly onTap: () => void;

    private readonly onDown = (event: PointerEvent) => {
        if (event.pointerType === 'mouse' || isControl(event.target)) {
            return;
        }
        if (this.canSteer()) {
            if (!this.steering) {
                const point = { x: event.clientX, y: event.clientY };
                this.steering = { id: event.pointerId, centre: point, finger: point };
            }
        } else if (this.tapping === null) {
            this.tapping = event.pointerId;
        }
    };

    private readonly onMove = (event: PointerEvent) => {
        if (this.steering?.id === event.pointerId) {
            this.steering.finger = { x: event.clientX, y: event.clientY };
            this.steering.centre = followFinger(this.steering.centre, this.steering.finger);
        }
    };

    private readonly onUp = (event: PointerEvent) => {
        if (this.steering?.id === event.pointerId) {
            this.steering = null;
        }
        if (this.tapping === event.pointerId) {
            this.tapping = null;
            if (!this.canSteer() && event.type === 'pointerup') {
                this.onTap();
            }
        }
    };

    private readonly onBlur = () => {
        this.steering = null;
        this.tapping = null;
    };

    constructor(target: Window, canSteer: () => boolean, onTap: () => void) {
        this.target = target;
        this.canSteer = canSteer;
        this.onTap = onTap;
        target.addEventListener('pointerdown', this.onDown);
        target.addEventListener('pointermove', this.onMove);
        target.addEventListener('pointerup', this.onUp);
        target.addEventListener('pointercancel', this.onUp);
        target.addEventListener('blur', this.onBlur);
    }

    /** The current direction, or none when no finger steers. */
    direction(): MoveInput {
        if (!this.steering || !this.canSteer()) {
            return STILL;
        }
        const { centre, finger } = this.steering;
        return dragDirection(finger.x - centre.x, finger.y - centre.y);
    }

    /** The stick to draw, or null when no finger steers. */
    stick(): TouchStick | null {
        return this.steering && this.canSteer() ? { centre: this.steering.centre, finger: this.steering.finger } : null;
    }

    dispose(): void {
        this.target.removeEventListener('pointerdown', this.onDown);
        this.target.removeEventListener('pointermove', this.onMove);
        this.target.removeEventListener('pointerup', this.onUp);
        this.target.removeEventListener('pointercancel', this.onUp);
        this.target.removeEventListener('blur', this.onBlur);
        this.onBlur();
    }
}

/** Steering from the keys and from a finger together: a finger that steers wins, the keys otherwise. */
export function combineDirections(keys: MoveInput, finger: MoveInput): MoveInput {
    return finger.x !== 0 || finger.z !== 0 ? finger : keys;
}
