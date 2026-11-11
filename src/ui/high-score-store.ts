import { insertHighScore, parseHighScores } from '../core/score/high-scores';

const KEY = 'gotta-go.high-scores';

/** The best scores kept in this browser. Storage can be missing or refuse writes: the game works without it. */
export function loadHighScores(): number[] {
    try {
        return parseHighScores(window.localStorage.getItem(KEY));
    } catch {
        return [];
    }
}

/** Records a finished run's score; returns the updated table and the score's place in it (`-1` if not in it). */
export function recordHighScore(score: number): { table: number[]; rank: number } {
    const result = insertHighScore(loadHighScores(), score);
    try {
        window.localStorage.setItem(KEY, JSON.stringify(result.table));
    } catch {
        // Private browsing or storage disabled: the table lives for this page only
    }
    return result;
}
