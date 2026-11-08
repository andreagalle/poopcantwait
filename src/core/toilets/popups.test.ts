import { describe, expect, it } from 'vitest';

import { POPUP_TOILETS } from '../../config/tuning';
import { generateCity } from '../city/generate';
import { Rng } from '../rng';

import { choosePopupSpot, popupIntervalAt, touchesPopup } from './popups';

describe('pop-up toilets', () => {
    it('come more often as Benny grows', () => {
        expect(popupIntervalAt(0)).toBe(POPUP_TOILETS.spawnIntervalSeconds.atZeroWeight);
        expect(popupIntervalAt(1)).toBe(POPUP_TOILETS.spawnIntervalSeconds.atMaxWeight);
        expect(popupIntervalAt(0.5)).toBeCloseTo(15.5, 10);
        expect(popupIntervalAt(9)).toBe(POPUP_TOILETS.spawnIntervalSeconds.atMaxWeight);
    });

    it('spawn where Benny can go, within the path distance band, with room around them', () => {
        const city = generateCity(5);
        const rng = new Rng(5);
        for (const diameter of [0.9, 4, 7.5]) {
            const start = city.nav.nearestStandable(city.spawn, diameter)!;
            const distances = city.nav.pathDistances(start, diameter);
            for (let i = 0; i < 20; i++) {
                const spot = choosePopupSpot(city.nav, distances, diameter, 25, 80, rng)!;
                const d = distances[city.nav.cellAt(spot.x, spot.z)];
                expect(d).toBeGreaterThanOrEqual(25);
                expect(d).toBeLessThanOrEqual(80);
                expect(city.nav.canStand(spot.x, spot.z, diameter)).toBe(true);
                expect(city.nav.clearanceAt(spot.x, spot.z)).toBeGreaterThan(POPUP_TOILETS.footprintMetres / 2);
            }
        }
    });

    it('find no spot when nothing is in the band', () => {
        const city = generateCity(6);
        const distances = city.nav.pathDistances(city.spawn, 0.9);
        expect(choosePopupSpot(city.nav, distances, 0.9, 5000, 6000, new Rng(1))).toBeNull();
    });

    it('are used by stepping into them', () => {
        const popup = { id: 1, x: 0, z: 0, secondsLeft: 10 };
        expect(touchesPopup(1, 0, 0.45, popup, 0.3)).toBe(true);
        expect(touchesPopup(3, 0, 0.45, popup, 0.3)).toBe(false);
        expect(touchesPopup(4.7, 0, 3.75, popup, 0.3)).toBe(true);
        expect(touchesPopup(4.8, 0, 3.75, popup, 0.3)).toBe(false);
    });
});
