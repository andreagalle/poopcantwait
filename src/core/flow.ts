/** Which screen is up (design: *HUD and screens*): the title before a run, the run itself, paused, or over. */
export type Screen = 'title' | 'running' | 'paused' | 'over';

/**
 * What the player asked for: the menu keys (Enter or Space starts and confirms, Escape or P pauses), or `away` when
 * the page loses focus or is hidden.
 */
export type FlowAction = 'start' | 'pause' | 'away';

/** The screen after an action, or `restart` for a new run (from the game-over screen). */
export function nextScreen(screen: Screen, action: FlowAction): Screen | 'restart' {
    switch (action) {
        case 'start':
            if (screen === 'title') {
                return 'running';
            }
            return screen === 'over' ? 'restart' : screen;
        case 'pause':
            if (screen === 'running') {
                return 'paused';
            }
            return screen === 'paused' ? 'running' : screen;
        case 'away':
            // Leaving the page pauses a run, so the countdown never runs out unseen; coming back stays paused
            return screen === 'running' ? 'paused' : screen;
    }
}

/**
 * What a tap on the screen does (touch controls, design: *Controls*): it starts the run from the title, goes on from
 * pause and plays again after a game over, like Enter. During the run a finger steers instead, so a tap does nothing.
 */
export function tapAction(screen: Screen): Exclude<FlowAction, 'away'> | null {
    switch (screen) {
        case 'title':
        case 'over':
            return 'start';
        case 'paused':
            return 'pause';
        case 'running':
            return null;
    }
}

/** Whether the simulation advances on this screen. */
export function isSimulating(screen: Screen): boolean {
    return screen === 'running';
}
