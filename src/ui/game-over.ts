/**
 * The end of a run: Benny is out of clean underpants. The final score and the best scores kept in this browser, the
 * new one marked. Enter or Space starts a new run (handled with the other menu keys), or a tap on a touch-only device.
 */
export function showGameOver(
    parent: HTMLElement,
    result: { score: number; table: readonly number[]; rank: number },
    touchOnly = false
): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'game-over';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Game over');

    const title = document.createElement('h2');
    title.textContent = 'Out of underpants!';
    const score = document.createElement('p');
    score.className = 'game-over-score';
    score.textContent = `Score ${result.score}`;
    panel.append(title, score);

    if (result.rank === 0) {
        const best = document.createElement('p');
        best.className = 'game-over-best';
        best.textContent = 'New best!';
        panel.append(best);
    }
    if (result.table.length > 0) {
        const list = document.createElement('ol');
        list.className = 'game-over-table';
        list.setAttribute('aria-label', 'Best scores');
        result.table.forEach((points, i) => {
            const item = document.createElement('li');
            item.textContent = String(points);
            item.classList.toggle('is-new', i === result.rank);
            list.append(item);
        });
        panel.append(list);
    }

    const hint = document.createElement('p');
    hint.textContent = touchOnly ? 'Tap to play again' : 'Press Enter to play again';
    panel.append(hint);
    parent.append(panel);
    return panel;
}
