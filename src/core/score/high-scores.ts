import { SCORING } from '../../config/tuning';

/** The best scores, highest first (design: *Scoring*: the best five, kept in the browser). */
export type HighScores = readonly number[];

/** Adds a score to the table, keeping the best few; also says where it landed (`-1` if it did not make it). */
export function insertHighScore(table: HighScores, score: number): { table: number[]; rank: number } {
    if (!(score > 0)) {
        // A run that scored nothing does not take a place in the table
        return { table: [...table], rank: -1 };
    }
    const all = [...table, score].sort((a, b) => b - a).slice(0, SCORING.highScoresKept);
    return { table: all, rank: all.indexOf(score) };
}

/** Reads a stored table, tolerating anything malformed (it comes from the browser's storage). */
export function parseHighScores(text: string | null): number[] {
    if (!text) {
        return [];
    }
    try {
        const value: unknown = JSON.parse(text);
        if (!Array.isArray(value)) {
            return [];
        }
        return value
            .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0)
            .map(Math.floor)
            .sort((a, b) => b - a)
            .slice(0, SCORING.highScoresKept);
    } catch {
        return [];
    }
}
