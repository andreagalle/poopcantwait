import { describe, expect, it } from 'vitest';

import { FOOD } from '../../config/tuning';
import { generateCity } from '../city/generate';
import { ZONE } from '../city/types';
import { Rng } from '../rng';

import { chooseFoodSpot, chooseKind, ITEM_RADIUS, touchesFood, vegetableShareAt } from './food';

describe('food', () => {
    it('grows the vegetable share from 20% to 40% over eight minutes', () => {
        expect(vegetableShareAt(0)).toBe(FOOD.vegetableShare.start);
        expect(vegetableShareAt(240)).toBeCloseTo(0.3, 10);
        expect(vegetableShareAt(480)).toBe(FOOD.vegetableShare.end);
        expect(vegetableShareAt(10_000)).toBe(FOOD.vegetableShare.end);
        expect(vegetableShareAt(-5)).toBe(FOOD.vegetableShare.start);
    });

    it('draws vegetables at the share of the moment, and every kind', () => {
        const rng = new Rng(1);
        const early = Array.from({ length: 4000 }, () => chooseKind(rng, 0));
        const late = Array.from({ length: 4000 }, () => chooseKind(rng, 600));
        const share = (list: typeof early) => list.filter((k) => k.category === 'vegetable').length / list.length;
        expect(share(early)).toBeGreaterThan(0.17);
        expect(share(early)).toBeLessThan(0.23);
        expect(share(late)).toBeGreaterThan(0.37);
        expect(share(late)).toBeLessThan(0.43);
        const ids = new Set(late.map((k) => k.id));
        expect(ids.size).toBe(Object.keys(FOOD.junk).length + Object.keys(FOOD.vegetables).length);
    });

    it('spawns on walkable ground near Benny, clear of walls and of other items', () => {
        const city = generateCity(8);
        const rng = new Rng(8);
        // Around the middle of an alley, so some spots land in it: food tempts a slim Benny into alleys too
        const alley = city.alleys[0];
        const middle = (alley.from + alley.to) / 2;
        const near = alley.axis === 'z' ? { x: alley.centre, z: middle } : { x: middle, z: alley.centre };
        const placed: { x: number; z: number }[] = [];
        let alleys = 0;
        for (let i = 0; i < 300; i++) {
            const spot = chooseFoodSpot(city.nav, near, placed, rng);
            if (!spot) {
                continue;
            }
            const d = Math.hypot(spot.x - near.x, spot.z - near.z);
            expect(d).toBeGreaterThanOrEqual(FOOD.spawnDistanceMetres.min - 1);
            expect(d).toBeLessThanOrEqual(FOOD.spawnDistanceMetres.max + 1);
            expect(city.nav.zoneAt(spot.x, spot.z)).not.toBe(ZONE.blocked);
            expect(city.nav.clearanceAt(spot.x, spot.z)).toBeGreaterThan(ITEM_RADIUS);
            expect(placed.every((p) => Math.hypot(p.x - spot.x, p.z - spot.z) >= 2)).toBe(true);
            alleys += city.nav.zoneAt(spot.x, spot.z) === ZONE.alley ? 1 : 0;
            placed.push(spot);
        }
        expect(placed.length).toBeGreaterThan(60);
        expect(alleys).toBeGreaterThan(0);
    });

    it('is eaten by touching it', () => {
        const item = { id: 1, kind: { category: 'junk', id: 'burger' } as const, x: 0, z: 0, secondsLeft: 10 };
        expect(touchesFood(0.9, 0, 0.45, item)).toBe(true);
        expect(touchesFood(1, 0, 0.45, item)).toBe(false);
        expect(touchesFood(4, 0, 3.75, item)).toBe(true);
    });
});
