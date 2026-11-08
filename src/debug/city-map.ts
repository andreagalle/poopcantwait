import { CITY, WEIGHT } from '../config/tuning';
import type { City } from '../core/city/types';
import { ZONE } from '../core/city/types';

import './debug.css';

type Rgb = readonly [number, number, number];

const ZONE_COLORS: Record<number, Rgb> = {
    [ZONE.blocked]: [24, 24, 30],
    [ZONE.alley]: [230, 200, 120],
    [ZONE.street]: [200, 200, 205],
    [ZONE.avenue]: [140, 150, 165],
    [ZONE.boulevard]: [95, 110, 140],
    [ZONE.plaza]: [240, 220, 180],
    [ZONE.park]: [140, 200, 100],
    [ZONE.unassigned]: [255, 0, 255]
};

/** Clearance bands: who fits where. Each band starts where a Benny of that size fits. */
const MAX_DIAMETER = WEIGHT.diameter.baseMetres + WEIGHT.diameter.gainMetres;
const FIT_BANDS: { minClearance: number; color: Rgb; label: string }[] = [
    { minClearance: MAX_DIAMETER / 2, color: [40, 150, 95], label: `maximum weight (${MAX_DIAMETER} m)` },
    {
        minClearance: CITY.streetClasses.street.widthMetres / 2,
        color: [80, 170, 110],
        label: `up to ${CITY.streetClasses.street.widthMetres} m (streets)`
    },
    {
        minClearance: CITY.streetClasses.alley.widthMetres / 2,
        color: [170, 215, 140],
        label: `up to ${CITY.streetClasses.alley.widthMetres} m (alleys)`
    },
    { minClearance: 0.01, color: [230, 240, 200], label: 'slimmer only' }
];

function paint(canvas: HTMLCanvasElement, city: City, colorOf: (cell: number) => Rgb): void {
    const { nav } = city;
    canvas.width = nav.size;
    canvas.height = nav.size;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(nav.size, nav.size);
    for (let cell = 0; cell < nav.zone.length; cell++) {
        const [r, g, b] = colorOf(cell);
        image.data.set([r, g, b, 255], cell * 4);
    }
    context.putImageData(image, 0, 0);

    // Kiosk spots and the spawn point on top
    const toPixel = (v: number) => v + nav.halfSize;
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#d32f2f';
    context.lineWidth = 2;
    for (const k of city.kioskSpots) {
        context.fillRect(toPixel(k.rect.x0) - 2, toPixel(k.rect.z0) - 2, 6, 6);
        context.strokeRect(toPixel(k.rect.x0) - 2, toPixel(k.rect.z0) - 2, 6, 6);
    }
    context.fillStyle = '#d32f2f';
    context.beginPath();
    context.arc(toPixel(city.spawn.x), toPixel(city.spawn.z), 4, 0, 2 * Math.PI);
    context.fill();
}

function legend(items: { color: Rgb; label: string }[]): HTMLElement {
    const list = document.createElement('ul');
    list.className = 'debug-legend';
    for (const item of items) {
        const entry = document.createElement('li');
        const swatch = document.createElement('span');
        swatch.style.background = `rgb(${item.color.join(',')})`;
        entry.append(swatch, item.label);
        list.append(entry);
    }
    return list;
}

/**
 * `?debug=1`: two minimaps of the navigation grid. Left, the zones (street classes, plaza, park, solid); right, the
 * clearance bands that tell which Benny sizes fit where. White squares are kiosk spots, the red dot is the spawn.
 */
export function mountCityDebugMap(parent: HTMLElement, city: City): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'debug-map';
    panel.setAttribute('aria-label', 'Debug map');

    const title = document.createElement('p');
    title.className = 'debug-title';
    title.textContent = `debug · seed ${city.seed}`;

    const zones = document.createElement('canvas');
    paint(zones, city, (cell) => ZONE_COLORS[city.nav.zone[cell]] ?? ZONE_COLORS[ZONE.unassigned]);
    const fit = document.createElement('canvas');
    paint(fit, city, (cell) => {
        const clearance = city.nav.clearance[cell];
        return FIT_BANDS.find((band) => clearance >= band.minClearance)?.color ?? ZONE_COLORS[ZONE.blocked];
    });

    const maps = document.createElement('div');
    maps.className = 'debug-maps';
    maps.append(zones, fit);
    panel.append(
        title,
        maps,
        legend([
            { color: ZONE_COLORS[ZONE.alley], label: 'alley' },
            { color: ZONE_COLORS[ZONE.street], label: 'street' },
            { color: ZONE_COLORS[ZONE.avenue], label: 'avenue' },
            { color: ZONE_COLORS[ZONE.boulevard], label: 'boulevard' },
            { color: ZONE_COLORS[ZONE.plaza], label: 'plaza' },
            { color: ZONE_COLORS[ZONE.park], label: 'park' }
        ]),
        legend(FIT_BANDS.map((band) => ({ color: band.color, label: `fits Benny ${band.label}` })))
    );
    parent.append(panel);
    return panel;
}
