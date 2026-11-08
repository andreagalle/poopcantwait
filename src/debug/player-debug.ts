import type { Game } from '../core/game';
import { diameterAt, girthTierAt } from '../core/player/weight';

/**
 * `?debug=1`: Benny's live numbers (position, speed, weight, girth, clearance under him) and his position on the
 * minimaps. Read-only: it never changes the run.
 */
export class PlayerDebug {
    private readonly readout: HTMLElement;
    private readonly markers: HTMLCanvasElement[];
    private lastText = '';

    constructor(panel: HTMLElement, game: Game) {
        this.readout = document.createElement('p');
        this.readout.className = 'debug-readout';
        panel.querySelector('.debug-title')?.after(this.readout);

        // One transparent canvas on top of each minimap for Benny's marker
        this.markers = [...panel.querySelectorAll<HTMLElement>('.debug-map-cell')].map((cell) => {
            const marker = document.createElement('canvas');
            marker.className = 'debug-marker';
            marker.width = game.city.nav.size;
            marker.height = game.city.nav.size;
            cell.append(marker);
            return marker;
        });
    }

    update(game: Game): void {
        const p = game.player;
        const diameter = diameterAt(p.weight);
        const text =
            `x ${p.x.toFixed(1)} z ${p.z.toFixed(1)} · ${Math.hypot(p.vx, p.vz).toFixed(1)} m/s · ` +
            `w ${p.weight.toFixed(2)} ${girthTierAt(p.weight)} · d ${diameter.toFixed(2)} m · ` +
            `clearance ${game.city.nav.clearanceAt(p.x, p.z).toFixed(1)} m · ` +
            `${game.phase} · ${game.urgency.secondsLeft.toFixed(1)} s · underpants ${game.urgency.cleanUnderpants}`;
        if (text !== this.lastText) {
            this.readout.textContent = text;
            this.lastText = text;
        }
        const half = game.city.halfSize;
        for (const marker of this.markers) {
            const context = marker.getContext('2d')!;
            context.clearRect(0, 0, marker.width, marker.height);
            context.strokeStyle = '#ff3d00';
            context.lineWidth = 3;
            context.beginPath();
            context.arc(p.x + half, p.z + half, Math.max(4, diameter / 2), 0, 2 * Math.PI);
            context.stroke();
        }
    }
}
