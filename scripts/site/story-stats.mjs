#!/usr/bin/env node
/**
 * Prints the numbers behind the story page (site/story/): every message the maintainer typed, the agent's tool calls
 * up to each of them, and the merged pull requests with the agent's tool calls up to each merge.
 *
 *   npm run story:stats
 *
 * It reads the Claude Code transcripts of this project (~/.claude/projects/<project>/*.jsonl, top-level sessions
 * only) and `gh pr list`. Transcripts stay on the machine that ran the sessions: run it in the Codespace. It prints
 * the maintainer's messages, so keep its output out of the repository; the story quotes them in short, translated.
 *
 * T+ is the time since the first message (the kickoff); times are UTC and CET (UTC+1).
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

console.log('Maintainer messages (n, UTC, CET, T+, agent tool calls so far, start of the message)');
human.forEach((m, i) => {
    const preview = m.text.replace(/\s+/g, ' ').slice(0, 70);
    console.log(`${i + 1}\t${m.at.slice(0, 16)}\t${cet(m.at)}\t${elapsed(m.at)}\t${toolsUntil(m.at)}\t${preview}`);
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
