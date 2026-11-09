import { Vec3 } from 'playcanvas';
import type { CameraComponent, Mat4 } from 'playcanvas';

import { TOILET_INDICATORS } from '../config/tuning';
import type { Game, ToiletRef } from '../core/game';

/** Height of the label above a toilet on screen, in metres. */
const LABEL_HEIGHT = 3.6;
/** Distance kept from the screen edges, in pixels (leaves room for the HUD corners). */
const EDGE_MARGIN = { side: 46, top: 96, bottom: 86 };

interface Indicator {
    readonly toilet: ToiletRef;
    readonly x: number;
    readonly z: number;
    /** Path distance at Benny's girth, or `Infinity` when he does not fit the way there. */
    readonly distance: number;
}

const TOILET_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M5 3 h6 v7 h-6 Z M4 11 h16 a1 1 0 0 1 1 1 a7 6 0 0 1 -7 6 l1 3 h-6 l1 -3 a7 6 0 0 1 -7 -6 a1 1 0 0 1 1 -1 Z"/>
</svg>`;

/**
 * Off-screen toilet indicators (design: *Finding them*): the three nearest free toilets by path distance at Benny's
 * current girth, with the distance in metres and the nearest highlighted. If fewer than three are within reach, the
 * nearest free ones he cannot fit through to fill in, in grey, so the player sees why they do not count. A toilet in
 * view gets its label over it; one out of view gets an arrow at the screen edge, pointing its way.
 */
export class ToiletIndicators {
    private readonly badges: HTMLElement[];
    private readonly world = new Vec3();
    private readonly screen = new Vec3();
    private readonly view = new Vec3();

    constructor(parent: HTMLElement) {
        const layer = document.createElement('div');
        layer.className = 'toilet-indicators';
        parent.append(layer);
        this.badges = Array.from({ length: TOILET_INDICATORS.count }, () => {
            const badge = document.createElement('div');
            badge.className = 'toilet-indicator';
            badge.hidden = true;
            badge.innerHTML = `<span class="toilet-arrow"></span>${TOILET_ICON}<span class="toilet-distance"></span>`;
            layer.append(badge);
            return badge;
        });
    }

    /** The toilets to show, nearest first. */
    static choose(game: Game): Indicator[] {
        const all = game.freeToilets().map((toilet): Indicator => {
            const at = ToiletIndicators.position(game, toilet);
            return { toilet, ...at, distance: game.toiletDistance(toilet) };
        });
        const reachable = all.filter((i) => Number.isFinite(i.distance)).sort((a, b) => a.distance - b.distance);
        const straight = (i: Indicator) => Math.hypot(i.x - game.player.x, i.z - game.player.z);
        const unreachable = all.filter((i) => !Number.isFinite(i.distance)).sort((a, b) => straight(a) - straight(b));
        return [...reachable, ...unreachable].slice(0, TOILET_INDICATORS.count);
    }

    private static position(game: Game, toilet: ToiletRef): { x: number; z: number } {
        if (toilet.kind === 'popup') {
            const popup = game.popups.find((p) => p.id === toilet.id)!;
            return { x: popup.x, z: popup.z };
        }
        const r = game.city.kioskSpots[toilet.index].rect;
        return { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
    }

    update(game: Game, camera: CameraComponent): void {
        const chosen = game.phase === 'over' ? [] : ToiletIndicators.choose(game);
        const width = window.innerWidth;
        const height = window.innerHeight;
        const viewMatrix: Mat4 = camera.viewMatrix;

        // Arrows radiate from where Benny is on screen
        this.world.set(game.player.x, 1, game.player.z);
        camera.worldToScreen(this.world, this.screen);
        const originX = this.screen.x;
        const originY = this.screen.y;

        const placed: { x: number; y: number; w: number; h: number }[] = [];
        this.badges.forEach((badge, i) => {
            const item = chosen[i];
            if (!item) {
                badge.hidden = true;
                return;
            }
            badge.hidden = false;
            const reachable = Number.isFinite(item.distance);
            badge.classList.toggle('is-nearest', i === 0 && reachable);
            badge.classList.toggle('is-unreachable', !reachable);
            const label = badge.querySelector('.toilet-distance')!;
            const text = reachable ? `${Math.round(item.distance)} m` : 'too wide';
            if (label.textContent !== text) {
                label.textContent = text;
            }

            this.world.set(item.x, LABEL_HEIGHT, item.z);
            viewMatrix.transformPoint(this.world, this.view);
            let x: number;
            let y: number;
            if (this.view.z < 0) {
                camera.worldToScreen(this.world, this.screen);
                x = this.screen.x;
                y = this.screen.y;
            } else {
                // Behind the camera: aim by the direction on the ground, which the fixed camera keeps screen-aligned
                x = originX + (item.x - game.player.x) * 1000;
                y = originY + (item.z - game.player.z) * 1000;
            }
            const inside =
                this.view.z < 0 &&
                x > EDGE_MARGIN.side &&
                x < width - EDGE_MARGIN.side &&
                y > EDGE_MARGIN.top &&
                y < height - EDGE_MARGIN.bottom;
            badge.classList.toggle('is-offscreen', !inside);
            if (!inside) {
                // Slide along the ray from Benny until it meets the inset screen rectangle
                const dx = x - originX;
                const dy = y - originY;
                const tx =
                    dx > 0
                        ? (width - EDGE_MARGIN.side - originX) / dx
                        : dx < 0
                          ? (EDGE_MARGIN.side - originX) / dx
                          : Infinity;
                const ty =
                    dy > 0
                        ? (height - EDGE_MARGIN.bottom - originY) / dy
                        : dy < 0
                          ? (EDGE_MARGIN.top - originY) / dy
                          : Infinity;
                const t = Math.max(0, Math.min(tx, ty, 1));
                x = originX + dx * t;
                y = originY + dy * t;
                const angle = Math.atan2(dy, dx);
                (badge.querySelector('.toilet-arrow') as HTMLElement).style.rotate = `${angle}rad`;
            }
            // Keep the whole badge on screen, and clear of the badges placed before it
            const w = badge.offsetWidth;
            const h = badge.offsetHeight;
            x = Math.min(Math.max(x, w / 2 + 8), width - w / 2 - 8);
            y = Math.min(Math.max(y, h / 2 + 8), height - h / 2 - 8);
            for (let tries = 0; tries < placed.length * 2; tries++) {
                const hit = placed.find((p) => Math.abs(p.x - x) < (p.w + w) / 2 && Math.abs(p.y - y) < (p.h + h) / 2);
                if (!hit) {
                    break;
                }
                y = hit.y + (y < height / 2 ? 1 : -1) * ((hit.h + h) / 2 + 4);
            }
            placed.push({ x, y, w, h });
            badge.style.left = `${x}px`;
            badge.style.top = `${y}px`;
        });
    }
}
