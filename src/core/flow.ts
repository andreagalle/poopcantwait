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

/** Whether the simulation advances on this screen. */
export function isSimulating(screen: Screen): boolean {
    return screen === 'running';
}
