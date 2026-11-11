import { describe, expect, it } from 'vitest';

import { SCORING } from '../../config/tuning';

import { insertHighScore, parseHighScores } from './high-scores';
import { initialScore, scoreCrumple, scoreJunk, scoreRelief, tickScore } from './score';

describe('score', () => {
    it('scores junk food and builds a combo by eating within the window, up to the maximum', () => {
        let s = initialScore();
        const gains: number[] = [];
        for (let i = 0; i < 6; i++) {
            const r = scoreJunk(s, 100);
            gains.push(r.gained);
            s = tickScore(r.state, 1);
        }
        expect(gains).toEqual([100, 150, 200, 250, 300, 300]);
        expect(s.points).toBe(1300);
        expect(s.multiplier).toBe(SCORING.combo.max);
    });

    it('drops the combo after the window without eating', () => {
        let s = scoreJunk(initialScore(), 100).state;
        s = scoreJunk(s, 100).state;
        expect(s.multiplier).toBe(1.5);
        s = tickScore(s, SCORING.combo.windowSeconds + 0.01);
        expect(s.multiplier).toBe(1);
        expect(s.comboSecondsLeft).toBe(0);
        expect(tickScore(s, 1)).toBe(s);
        expect(scoreJunk(s, 40).gained).toBe(40);
    });

    it('gives the relief bonus plus the clutch bonus per second left', () => {
        const r = scoreRelief(initialScore(), 12.4);
        expect(r.gained).toBe(SCORING.relief.basePoints + 248);
        expect(scoreRelief(initialScore(), -3).gained).toBe(SCORING.relief.basePoints);
    });

    it('scores crumpled vehicles', () => {
        expect(scoreCrumple(initialScore(), 'car').gained).toBe(300);
        expect(scoreCrumple(initialScore(), 'bus').gained).toBe(800);
    });
});

describe('high scores', () => {
    it('keeps the best five, highest first, and says where a new score lands', () => {
        let table: number[] = [];
        for (const score of [300, 1200, 50, 800, 800]) {
            table = insertHighScore(table, score).table;
        }
        expect(table).toEqual([1200, 800, 800, 300, 50]);
        const best = insertHighScore(table, 5000);
        expect(best.rank).toBe(0);
        expect(best.table).toEqual([5000, 1200, 800, 800, 300]);
        expect(insertHighScore(best.table, 10).rank).toBe(-1);
        expect(insertHighScore([], 0)).toEqual({ table: [], rank: -1 });
        expect(insertHighScore([300], 0).table).toEqual([300]);
    });

    it('reads stored tables defensively', () => {
        expect(parseHighScores(null)).toEqual([]);
        expect(parseHighScores('not json')).toEqual([]);
        expect(parseHighScores('{"a":1}')).toEqual([]);
        expect(parseHighScores('[10, "x", -5, 300.7, null, 99, 1, 2, 3]')).toEqual([300, 99, 10, 3, 2]);
    });
});
