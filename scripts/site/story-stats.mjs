#!/usr/bin/env node
/**
 * Prints the numbers behind the story page (site/story/): every message the maintainer typed, the agent's tool calls
 * up to each of them, and the merged pull requests with the agent's tool calls up to each merge.
 *
 *   npm run story:stats            the lists and the totals
 *   npm run story:stats -- --json  the numbers the story is built from, as JSON (no message text)
 *
 * It reads the Claude Code transcripts of this project (~/.claude/projects/<project>/*.jsonl, top-level sessions
 * only) and `gh pr list`. Transcripts stay on the machine that ran the sessions: run it in the Codespace. It prints
 * the maintainer's messages, so keep its output out of the repository; the story quotes them in short, translated.
 *
 * T+ is the time since the first message (the kickoff); times are UTC and CET (UTC+1). The page itself shows no dates or
 * times of day, only the project day and how long the agent had been going on its own.
 *
 * A run is the agent's work on its own from one message of the maintainer to the next. Messages that only resume an
 * interrupted session ("continua", "presegui quello che stavi facendo", an interruption) are nudges: they do not end a
 * run, since at the maintainer's request the story counts the work as if they had never been needed. A run adds up the
 * agent's working time, from each message to its last action before the next one, leaving out the idle time between.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectDir = path.join(os.homedir(), '.claude', 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'));
const files = readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'));

/**
 * The text a person typed, or null for tool results, task notifications, slash-command wrappers, meta lines, the
 * summary Claude Code writes when a long conversation continues, and messages from other agent sessions.
 */
function typedText(entry) {
    if (entry.type !== 'user' || entry.isMeta || entry.isCompactSummary) return null;
    const content = entry.message?.content;
    let text = '';
    if (typeof content === 'string') {
        text = content;
    } else if (Array.isArray(content)) {
        if (content.some((part) => part.type === 'tool_result')) return null;
        text = content
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('\n');
    }
    text = text.replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, '').trim();
    if (!text || /^<(task-notification|command-|local-command|system-reminder|cross-session-message)/.test(text)) {
        return null;
    }
    if (/^This session is being continued from a previous conversation/.test(text)) return null;
    if (/^Another Claude session sent a message/.test(text)) return null;
    return text;
}

const human = [];
const tools = [];
for (const file of files) {
    for (const line of readFileSync(path.join(projectDir, file), 'utf8').split('\n')) {
        if (!line) continue;
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        const text = typedText(entry);
        if (text) human.push({ at: entry.timestamp, text });
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
            for (const part of entry.message.content) {
                if (part.type === 'tool_use') tools.push(entry.timestamp);
            }
        }
    }
}
human.sort((a, b) => a.at.localeCompare(b.at));
tools.sort();

const start = Date.parse(human[0].at);
const toolsUntil = (iso) => tools.filter((t) => t <= iso).length;
const elapsed = (iso) => {
    const minutes = Math.round((Date.parse(iso) - start) / 60000);
    return `T+${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
};
const cet = (iso) => new Date(Date.parse(iso) + 3600_000).toISOString().slice(5, 16).replace('T', ' ');
const minutesSince = (ms) => Math.round((ms - start) / 60000);
const hm = (minutes) => `${Math.floor(minutes / 60)}:${String(Math.round(minutes) % 60).padStart(2, '0')}`;

/** A message that only resumes an interrupted session, and so does not end the agent's run. */
const isNudge = (text) =>
    /^(continua|\[Request interrupted by user[^\]]*\]|presegui quello che stavi facendo\b[\s\S]*)$/i.test(text.trim());

// The agent's working time after each message: from the message to its last action before the next one
const humanMs = human.map((m) => Date.parse(m.at));
const toolMs = tools.map((t) => Date.parse(t));
const runs = humanMs.map((at, i) => {
    const next = humanMs[i + 1] ?? Infinity;
    let last = at;
    let actions = 0;
    for (const t of toolMs) {
        if (t > at && t < next) {
            last = Math.max(last, t);
            actions++;
        }
    }
    return { from: minutesSince(at), minutes: (last - at) / 60000, actions };
});
const aloneMinutes = runs.reduce((sum, r) => sum + r.minutes, 0);
// The runs: working time added up from one message that is not a nudge to the next
const merged = [];
runs.forEach((r, i) => {
    if (i > 0 && isNudge(human[i].text)) {
        merged[merged.length - 1].minutes += r.minutes;
        merged[merged.length - 1].actions += r.actions;
    } else {
        merged.push({ from: r.from, minutes: r.minutes, actions: r.actions, message: i + 1 });
    }
});
const longest = merged.reduce((best, r) => (r.minutes > best.minutes ? r : best), merged[0]);

if (process.argv.includes('--json')) {
    console.log(
        JSON.stringify(
            {
                kickoffCet: cet(human[0].at),
                messages: runs.map((r, i) => ({
                    n: i + 1,
                    t: hm(r.from),
                    nudge: i > 0 && isNudge(human[i].text),
                    actionsBefore: toolsUntil(human[i].at),
                    aloneAfter: hm(r.minutes),
                    actions: r.actions
                })),
                aloneHours: Math.round(aloneMinutes / 60),
                longestAlone: hm(longest.minutes),
                longestAloneActions: longest.actions,
                longestAloneFrom: longest.message,
                runsOverAnHour: merged.filter((r) => r.minutes >= 60).length,
                nudges: runs.filter((_, i) => i > 0 && isNudge(human[i].text)).length,
                actionsPerMessage: Math.round(tools.length / human.length),
                clock: hm(minutesSince(Date.now()))
            },
            null,
            2
        )
    );
    process.exit(0);
}

console.log(
    'Maintainer messages (n, UTC, CET, T+, agent tool calls so far, agent working time after it h:mm, a nudge?, start)'
);
human.forEach((m, i) => {
    const preview = m.text.replace(/\s+/g, ' ').slice(0, 70);
    const alone = hm(runs[i].minutes);
    const nudge = i > 0 && isNudge(m.text) ? 'nudge' : '';
    console.log(
        `${i + 1}\t${m.at.slice(0, 16)}\t${cet(m.at)}\t${elapsed(m.at)}\t${toolsUntil(m.at)}\t${alone}\t${nudge}\t${preview}`
    );
});

let prs = [];
try {
    const json = execFileSync(
        'gh',
        ['pr', 'list', '--state', 'merged', '--limit', '200', '--json', 'number,title,mergedAt'],
        { encoding: 'utf8' }
    );
    prs = JSON.parse(json).sort((a, b) => a.mergedAt.localeCompare(b.mergedAt));
} catch {
    console.log('\n(gh pr list failed: no pull requests listed)');
}
if (prs.length > 0) {
    console.log('\nMerged pull requests (merged so far, #, CET, T+, agent tool calls so far, title)');
    prs.forEach((pr, i) => {
        console.log(
            `${i + 1}\t#${pr.number}\t${cet(pr.mergedAt)}\t${elapsed(pr.mergedAt)}\t${toolsUntil(pr.mergedAt)}\t${pr.title}`
        );
    });
}

console.log(
    `\nTotals: ${human.length} maintainer messages, ${tools.length} agent tool calls, ${prs.length} merged PRs, ${elapsed(new Date().toISOString())} since the kickoff`
);
console.log(
    `Alone: ${hm(aloneMinutes)} of agent work on its own in all, longest run ${hm(longest.minutes)} (${longest.actions} actions, from message ${longest.message}), ${merged.filter((r) => r.minutes >= 60).length} runs of an hour or more, nudges not counted as ending a run`
);
