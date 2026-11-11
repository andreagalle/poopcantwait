import { Vec3 } from 'playcanvas';
import type { CameraComponent } from 'playcanvas';

const world = new Vec3();
const screen = new Vec3();

/** A short label that rises and fades over a spot in the world: "-6 s" for a vegetable, "+100" for a burger. */
export function floatText(
    parent: HTMLElement,
    camera: CameraComponent,
    x: number,
    z: number,
    text: string,
    tone: 'good' | 'bad'
): void {
    world.set(x, 1.6, z);
    camera.worldToScreen(world, screen);
    const label = document.createElement('p');
    label.className = `float-text is-${tone}`;
    label.textContent = text;
    label.style.left = `${screen.x}px`;
    label.style.top = `${screen.y}px`;
    parent.append(label);
    label.addEventListener('animationend', () => label.remove());
}
