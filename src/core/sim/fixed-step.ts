/**
 * Turns variable frame times into a whole number of fixed simulation steps (AGENTS.md, Architecture). The remainder
 * carries over to the next frame, and `alpha` tells the renderer how far it is between the last two steps.
 */
export class FixedStepper {
    readonly stepSeconds: number;
    readonly maxSteps: number;
    private accumulator = 0;

    constructor(stepSeconds: number, maxSteps: number) {
        if (!(stepSeconds > 0) || !(maxSteps >= 1)) {
            throw new RangeError(
                `need a positive step and at least one step per frame, got ${stepSeconds}, ${maxSteps}`
            );
        }
        this.stepSeconds = stepSeconds;
        this.maxSteps = Math.floor(maxSteps);
    }

    /**
     * Adds a frame's elapsed time and returns how many steps to run now. Past `maxSteps`, the extra time is dropped,
     * so a stalled tab slows the game down instead of fast-forwarding it.
     */
    advance(frameSeconds: number): number {
        this.accumulator += Math.max(0, frameSeconds);
        let steps = Math.floor(this.accumulator / this.stepSeconds);
        if (steps > this.maxSteps) {
            steps = this.maxSteps;
            this.accumulator = 0;
        } else {
            this.accumulator -= steps * this.stepSeconds;
        }
        return steps;
    }

    /** Fraction of a step accumulated since the last one, from 0 to 1. */
    get alpha(): number {
        return Math.min(1, this.accumulator / this.stepSeconds);
    }
}
