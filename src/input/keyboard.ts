import type { MoveInput } from '../core/player/movement';

/** Arrow keys, screen-relative (design: *Controls*): up moves up the screen (-z), right moves right (+x). */
const ARROWS: Readonly<Record<string, MoveInput>> = {
    ArrowUp: { x: 0, z: -1 },
    ArrowDown: { x: 0, z: 1 },
    ArrowLeft: { x: -1, z: 0 },
    ArrowRight: { x: 1, z: 0 }
};

/**
 * Tracks the arrow keys for gameplay. Two keys together move diagonally (eight directions); opposite keys cancel. The
 * arrows never scroll the page, and releasing the window (alt-tab) releases every key.
 */
export class KeyboardInput {
    private readonly pressed = new Set<string>();
    private readonly target: Window;

    private readonly onKeyDown = (event: KeyboardEvent) => {
        if (event.key in ARROWS) {
            event.preventDefault();
            this.pressed.add(event.key);
        }
    };

    private readonly onKeyUp = (event: KeyboardEvent) => {
        if (event.key in ARROWS) {
            event.preventDefault();
            this.pressed.delete(event.key);
        }
    };

    private readonly onBlur = () => this.pressed.clear();

    constructor(target: Window) {
        this.target = target;
        target.addEventListener('keydown', this.onKeyDown);
        target.addEventListener('keyup', this.onKeyUp);
        target.addEventListener('blur', this.onBlur);
    }

    /** The current direction, normalised so diagonals are not faster. */
    direction(): MoveInput {
        let x = 0;
        let z = 0;
        for (const key of this.pressed) {
            x += ARROWS[key].x;
            z += ARROWS[key].z;
        }
        const length = Math.hypot(x, z);
        return length > 0 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
    }

    dispose(): void {
        this.target.removeEventListener('keydown', this.onKeyDown);
        this.target.removeEventListener('keyup', this.onKeyUp);
        this.target.removeEventListener('blur', this.onBlur);
        this.pressed.clear();
    }
}
