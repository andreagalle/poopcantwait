import { describe, expect, it } from 'vitest';

import { CITY, KIOSKS, POPUP_TOILETS } from '../../config/tuning';
import { generateCity } from '../city/generate';
import { ZONE } from '../city/types';
import { Rng } from '../rng';

import type { PopupSpot } from './popups';
import { choosePopupSpot, popupDoor, popupIntervalAt, touchesPopup, wallSpots } from './popups';

describe('pop-up toilets', () => {
    it('come more often as Benny grows', () => {
        expect(popupIntervalAt(0)).toBe(POPUP_TOILETS.spawnIntervalSeconds.atZeroWeight);
        expect(popupIntervalAt(1)).toBe(POPUP_TOILETS.spawnIntervalSeconds.atMaxWeight);
        expect(popupIntervalAt(0.5)).toBeCloseTo(15.5, 10);
        expect(popupIntervalAt(9)).toBe(POPUP_TOILETS.spawnIntervalSeconds.atMaxWeight);
    });

    it("back onto a building, door to the street, never in a street where cars pass, within Benny's reach", () => {
        for (const seed of [5, 42]) {
            const city = generateCity(seed);
            const nav = city.nav;
            const spots = wallSpots(nav, city.buildings, city.props);
            expect(spots.length).toBeGreaterThan(500);
            // Clear of the street furniture, a tree's canopy included
            for (const s of spots) {
                for (const p of city.props) {
                    const keep = p.kind === 'tree' ? CITY.streetProps.kinds.tree.canopyRadiusMetres : 0.3;
                    expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThan(keep + POPUP_TOILETS.footprintMetres / 2);
                }
            }
            expect(spots.every((s) => nav.zoneAt(s.x + s.facing.x * 0.3, s.z + s.facing.z * 0.3) !== ZONE.alley)).toBe(
                true
            );
            const rng = new Rng(seed);
            const half = POPUP_TOILETS.footprintMetres / 2;
            for (const diameter of [0.9, 4, 7.5]) {
                const start = nav.nearestStandable(city.spawn, diameter)!;
                const distances = nav.pathDistances(start, diameter);
                for (let i = 0; i < 15; i++) {
                    const spot = choosePopupSpot(nav, distances, spots, [], diameter, { min: 25, max: 80 }, rng)!;
                    expect(spot).not.toBeNull();
                    // Its back against the side of a building, the door facing away from it
                    const back = { x: spot.x - spot.facing.x * half, z: spot.z - spot.facing.z * half };
                    const against = city.buildings.some(
                        ({ rect }) => back.x >= rect.x0 && back.x <= rect.x1 && back.z >= rect.z0 && back.z <= rect.z1
                    );
                    expect(against).toBe(true);
                    expect(Math.abs(spot.facing.x) + Math.abs(spot.facing.z)).toBe(1);
                    // It stands on open ground, never in a street (cars drive there close to the facades)
                    for (const dx of [-0.45, 0.45]) {
                        for (const dz of [-0.45, 0.45]) {
                            const x = spot.x + spot.facing.x * 0.3 + dx;
                            const z = spot.z + spot.facing.z * 0.3 + dz;
                            expect(nav.zoneAt(x, z)).not.toBe(ZONE.blocked);
                            expect(nav.zoneAt(x, z)).not.toBe(ZONE.street);
                        }
                    }
                    // Its door is where Benny stands at his girth, within the band, and from there he steps into it
                    const door = popupDoor(spot, diameter / 2);
                    const walk = distances[nav.cellAt(door.x, door.z)];
                    expect(walk).toBeGreaterThanOrEqual(25);
                    expect(walk).toBeLessThanOrEqual(80);
                    const popup = { id: 1, ...spot, secondsLeft: 10 };
                    const step = { x: door.x - spot.facing.x * 0.01, z: door.z - spot.facing.z * 0.01 };
                    expect(touchesPopup(step.x, step.z, diameter / 2, popup, KIOSKS.doorReachMetres)).toBe(true);
                }
            }
        }
    });

    it('pick the nearest spot when asked, and keep clear of the cabins already up', () => {
        const city = generateCity(6);
        const nav = city.nav;
        const spots = wallSpots(nav, city.buildings);
        const distances = nav.pathDistances(city.spawn, 0.9);
        const walk = (s: PopupSpot) => {
            const door = popupDoor(s, 0.45);
            return distances[nav.cellAt(door.x, door.z)];
        };
        const rng = new Rng(3);
        const anywhere = { min: 5, max: Infinity };
        const nearest = choosePopupSpot(nav, distances, spots, [], 0.9, { ...anywhere, nearest: true }, rng)!;
        const any = choosePopupSpot(nav, distances, spots, [], 0.9, anywhere, rng)!;
        expect(walk(nearest)).toBeGreaterThanOrEqual(5);
        expect(walk(nearest)).toBeLessThanOrEqual(walk(any));
        const next = choosePopupSpot(nav, distances, spots, [nearest], 0.9, { ...anywhere, nearest: true }, rng)!;
        const footprint = POPUP_TOILETS.footprintMetres;
        expect(Math.abs(next.x - nearest.x) >= footprint || Math.abs(next.z - nearest.z) >= footprint).toBe(true);
    });

    it('find no spot when nothing is in the band', () => {
        const city = generateCity(6);
        const distances = city.nav.pathDistances(city.spawn, 0.9);
        const spots = wallSpots(city.nav, city.buildings);
        expect(choosePopupSpot(city.nav, distances, spots, [], 0.9, { min: 5000, max: 6000 }, new Rng(1))).toBeNull();
    });

    it('are used by stepping into them', () => {
        const popup = { id: 1, x: 0, z: 0, facing: { x: 0, z: 1 }, secondsLeft: 10 };
        expect(touchesPopup(1, 0, 0.45, popup, 0.3)).toBe(true);
        expect(touchesPopup(3, 0, 0.45, popup, 0.3)).toBe(false);
        expect(touchesPopup(4.7, 0, 3.75, popup, 0.3)).toBe(true);
        expect(touchesPopup(4.8, 0, 3.75, popup, 0.3)).toBe(false);
    });
});
