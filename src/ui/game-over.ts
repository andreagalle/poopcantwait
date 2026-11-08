/**
 * The end of a run: Benny is out of clean underpants. A first, plain version of the game-over screen (milestone M7
 * brings the title, pause and game-over screens with the best scores). Enter or Space starts a new run.
 */
export function showGameOver(parent: HTMLElement, onRestart: () => void): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'game-over';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Game over');
    const title = document.createElement('h2');
    title.textContent = 'Out of underpants!';
    const hint = document.createElement('p');
    hint.textContent = 'Press Enter to play again';
    panel.append(title, hint);
    parent.append(panel);

    const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            window.removeEventListener('keydown', onKey);
            onRestart();
        }
    };
    window.addEventListener('keydown', onKey);
    return panel;
}
