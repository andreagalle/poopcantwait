import { Vec3 } from 'playcanvas';
import type { CameraComponent } from 'playcanvas';

import type { Game } from '../core/game';

/** Height above the ground where the ring floats over the kiosk, in metres. */
const RING_HEIGHT = 4.2;
const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * At an occupied kiosk, Benny can wait at the door (design: *Public toilet kiosks*): a ring over the kiosk empties as
 * it gets closer to free, with the seconds left in the middle.
 */
export class WaitRing {
    private readonly root: HTMLElement;
    private readonly arc: SVGCircleElement;
    private readonly label: HTMLElement;
    private readonly world = new Vec3();
    private readonly screen = new Vec3();
    private waitingFor: number | null = null;
    private longest = 1;

    constructor(parent: HTMLElement) {
        this.root = document.createElement('div');
        this.root.className = 'wait-ring';
        this.root.hidden = true;
        this.root.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true">
<circle class="wait-ring-track" cx="24" cy="24" r="${RADIUS}"/>
<circle class="wait-ring-arc" cx="24" cy="24" r="${RADIUS}" stroke-dasharray="${CIRCUMFERENCE}"/>
</svg><span class="wait-ring-seconds"></span>`;
        this.arc = this.root.querySelector('.wait-ring-arc')!;
        this.label = this.root.querySelector('.wait-ring-seconds')!;
        parent.append(this.root);
    }

    update(game: Game, camera: CameraComponent): void {
        const index = game.waitingAt;
        if (index === null) {
            this.root.hidden = true;
            this.waitingFor = null;
            return;
        }
        const left = game.kiosks[index].secondsLeft;
        if (this.waitingFor !== index) {
            this.waitingFor = index;
            this.longest = Math.max(left, 0.001);
        }
        const r = game.city.kioskSpots[index].rect;
        this.world.set((r.x0 + r.x1) / 2, RING_HEIGHT, (r.z0 + r.z1) / 2);
        camera.worldToScreen(this.world, this.screen);
        this.root.hidden = false;
        this.root.style.left = `${this.screen.x}px`;
        this.root.style.top = `${this.screen.y}px`;
        this.arc.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - Math.min(1, left / this.longest)));
        this.label.textContent = String(Math.ceil(left));
    }
}
