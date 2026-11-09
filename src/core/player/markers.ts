import { CITY, COLLISIONS } from '../../config/tuning';

import { maxWeightFitting } from './weight';

/**
 * The markers on the HUD weight bar (design: *HUD and screens*): where alleys and streets stop fitting Benny, and
 * where he starts crumpling cars and buses instead of bouncing off them.
 */
export interface WeightMarker {
    readonly id: 'alleys' | 'streets' | 'cars' | 'buses';
    /** The weight at which it applies, 0 to 1. */
    readonly weight: number;
    /** `fit`: past this weight he no longer fits; `crush`: from this weight on he crumples them. */
    readonly kind: 'fit' | 'crush';
}

/** Every marker within the weight range, in order of weight. */
export function weightMarkers(): WeightMarker[] {
    const markers: WeightMarker[] = [
        { id: 'alleys', weight: maxWeightFitting(CITY.streetClasses.alley.widthMetres), kind: 'fit' },
        { id: 'streets', weight: maxWeightFitting(CITY.streetClasses.street.widthMetres), kind: 'fit' },
        { id: 'cars', weight: COLLISIONS.crumpleWeightThreshold.car, kind: 'crush' },
        { id: 'buses', weight: COLLISIONS.crumpleWeightThreshold.bus, kind: 'crush' }
    ];
    return markers.filter((m) => m.weight > 0 && m.weight < 1).sort((a, b) => a.weight - b.weight);
}

/** Whether Benny at weight `w` has passed a marker: too wide for it (`fit`), or heavy enough to crush it (`crush`). */
export function passed(marker: WeightMarker, w: number): boolean {
    return marker.kind === 'fit' ? w > marker.weight : w >= marker.weight;
}
