import { describe, expect, it } from 'vitest';

import { CITY } from '../../config/tuning';

import { generateCity } from './generate';
import { roofOf } from './roofs';

describe('roofs', () => {
    const city = generateCity(42);
    const roofs = city.buildings.map((b, i) => roofOf(b, i));

    it('give every kind of roof, the same for the same building every time', () => {
        const kinds = new Set(roofs.map((r) => r.kind));
        expect([...kinds].sort()).toEqual(['flat', 'garden', 'mansard', 'pitched', 'tower']);
        expect(city.buildings.map((b, i) => roofOf(b, i))).toEqual(roofs);
    });

    it('keep narrow buildings to flat or pitched roofs, and the clock tower to its spire', () => {
        city.buildings.forEach((b, i) => {
            const narrow = Math.min(b.rect.x1 - b.rect.x0, b.rect.z1 - b.rect.z0) < CITY.roofs.narrowMetres;
            if (b.landmark === 'clockTower') {
                expect(roofs[i].kind).toBe('tower');
            } else if (narrow) {
                expect(['flat', 'pitched']).toContain(roofs[i].kind);
            }
        });
    });

    it('say how high they rise, a pitched ridge no steeper nor higher than its tuning', () => {
        city.buildings.forEach((b, i) => {
            const r = roofs[i];
            expect(r.rise).toBeGreaterThan(0);
            if (r.kind === 'pitched') {
                const half = Math.min(b.rect.x1 - b.rect.x0, b.rect.z1 - b.rect.z0) / 2;
                expect(r.ridgeMetres).toBeLessThanOrEqual(
                    Math.min(CITY.roofs.maxRidgeMetres, CITY.roofs.ridgeSlope * half) + 1e-9
                );
                expect(r.rise).toBeCloseTo(r.ridgeMetres + CITY.roofs.chimneyMetres, 9);
            }
            if (r.kind === 'flat') {
                expect(r.acUnits).toBeGreaterThanOrEqual(1);
                expect(r.acUnits).toBeLessThanOrEqual(3);
            }
        });
    });
});
