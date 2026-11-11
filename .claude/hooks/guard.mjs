#!/usr/bin/env node
/**
 * Claude Code PreToolUse guard for this repository.
 *
 * Enforces the branch and change policy described in CONTRIBUTING.md and AGENTS.md:
 *  - no commits on master, main or dev, and no pushes to them (topic branches and PRs only);
 *  - no plain force pushes (only --force-with-lease, and only on topic branches), no bulk or tag pushes;
 *  - `gh pr merge` only for PRs whose base is dev, never with --admin;
 *  - PRs into master only from dev, and every `gh pr create` must name its base explicitly;
 *  - no PR approvals, no mutating `gh api` calls, no secret, ruleset, repo or workflow admin;
 *  - releases only through `gh release create vX.Y.Z --target <commit on master>`, where package.json at that commit
 *    has version X.Y.Z (the tag is created with the release); `gh release edit` without moving the tag; no deletions;
 *  - no edits, commits or pushes that touch the guardrail files listed in GUARDED_PATHS.
 *
 * Exit code 2 blocks the tool call and shows stderr to the agent. Unparseable input fails closed.
 * The checks are heuristics on the command text: they are a second layer behind the GitHub rulesets,
 * not a sandbox. Nested invocations (bash -c, eval, scripts) of guarded commands are refused outright.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PROTECTED_BRANCHES = ['master', 'main', 'dev'];
const RELEASE_BRANCHES = ['master', 'main'];
const MERGEABLE_BASES = ['dev'];
const GUARDED_PATHS = [
    '.github/workflows/',
    '.github/dependabot.yml',
    '.claude/hooks/',
    '.claude/settings.json',
    '.mcp.json',
    '.devcontainer/'
];
const WRITE_TOOLS = new Set([
    'sed', 'tee', 'mv', 'cp', 'rm', 'chmod', 'chown', 'truncate', 'perl', 'ln', 'install',
    'rsync', 'dd', 'patch', 'python', 'python3', 'node', 'npx', 'touch', 'unlink', 'awk'
]);

function block(reason) {
    process.stderr.write(
        `Blocked by .claude/hooks/guard.mjs: ${reason}\n` +
            'This rule comes from CONTRIBUTING.md and AGENTS.md. Do not try to work around it: ' +
            'if the maintainer has to do this, explain what is needed and stop.\n'
    );
    process.exit(2);
}

let input;
try {
    input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
    block('could not parse the hook input.');
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const shellDir = input.cwd || projectDir;
const toolName = input.tool_name;
const toolInput = input.tool_input ?? {};

/** Repository-relative POSIX path, or null when the path is outside the project. */
function relPath(p) {
    const rel = path.relative(projectDir, path.resolve(shellDir, p));
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel.split(path.sep).join('/');
}

function isGuarded(p) {
    const rel = relPath(String(p).replace(/^["']|["']$/g, ''));
    if (rel === null) return false;
    return GUARDED_PATHS.some((g) => (g.endsWith('/') ? rel === g.slice(0, -1) || rel.startsWith(g) : rel === g));
}

function mentionsGuardedPath(text) {
    return GUARDED_PATHS.some((g) => text.includes(g.endsWith('/') ? g.slice(0, -1) : g));
}

// ---------------------------------------------------------------- file edit tools
if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(toolName)) {
    const p = toolInput.file_path ?? toolInput.notebook_path;
    if (typeof p !== 'string' || p.length === 0) block('the edit has no file path.');
    if (isGuarded(p)) {
        block(`${p} is a guardrail file. Put the exact change you need in the PR description; the maintainer applies it.`);
    }
    process.exit(0);
}

if (toolName !== 'Bash') process.exit(0);

// ---------------------------------------------------------------- bash commands
const command = String(toolInput.command ?? '');

function run(bin, args) {
    try {
        return execFileSync(bin, args, { cwd: shellDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return null;
    }
}

function tokenize(segment) {
    const tokens = segment.match(/"(?:[^"\\]|\\.)*"|'[^']*'|\S+/g) ?? [];
    return tokens.map((t) => t.replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1'));
}

const segments = command
    .split(/&&|\|\||[;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(tokenize);

/** Finds `git <sub> ...` in a token list, skipping git's global options. */
function parseGit(tokens) {
    const i = tokens.findIndex((t) => t === 'git' || t.endsWith('/git'));
    if (i === -1) return null;
    let j = i + 1;
    while (j < tokens.length && tokens[j].startsWith('-')) {
        if (['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(tokens[j])) j += 2;
        else j += 1;
    }
    if (j >= tokens.length) return null;
    return { sub: tokens[j], args: tokens.slice(j + 1) };
}

/** Finds `gh <group> <action> ...` in a token list. */
function parseGh(tokens) {
    const i = tokens.findIndex((t) => t === 'gh' || t.endsWith('/gh'));
    if (i === -1) return null;
    return { group: tokens[i + 1] ?? '', action: tokens[i + 2] ?? '', args: tokens.slice(i + 2) };
}

function optionValue(args, names) {
    for (let k = 0; k < args.length; k++) {
        for (const n of names) {
            if (args[k] === n) return args[k + 1] ?? '';
            if (n.startsWith('--') && args[k].startsWith(`${n}=`)) return args[k].slice(n.length + 1);
        }
    }
    return null;
}

/** Positional arguments, skipping the values of options known to take one. */
function positionals(args, valueOptions) {
    const out = [];
    for (let k = 0; k < args.length; k++) {
        const a = args[k];
        if (a.startsWith('-')) {
            if (valueOptions.includes(a)) k += 1;
            continue;
        }
        out.push(a);
    }
    return out;
}

const stripHeads = (ref) => ref.replace(/^refs\/heads\//, '');
const currentBranch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']) ?? '';

// Track the branch each segment runs on, following switch/checkout within the same command.
let branch = currentBranch;
const handled = { push: false, prMerge: false, ghApi: false, release: false };

/**
 * A release ships a merge into master: `gh release create vX.Y.Z --target <commit>` creates the tag and the GitHub
 * Release together, and is allowed only when the commit is on origin/master and its package.json says X.Y.Z.
 */
function checkReleaseCreate(args) {
    const valueOptions = [
        '-t', '--title', '-n', '--notes', '-F', '--notes-file', '--target', '--discussion-category',
        '--notes-start-tag', '-R', '--repo'
    ];
    const tag = positionals(args, valueOptions)[0] ?? '';
    if (!/^v\d+\.\d+\.\d+$/.test(tag)) block('release tags are vMAJOR.MINOR.PATCH, given as the first argument.');
    const target = optionValue(args, ['--target']);
    if (!target) block('pass --target with the full SHA of the merge into master that this release ships.');
    if (run('git', ['rev-parse', '--verify', '--quiet', 'origin/master']) === null) {
        block('origin/master is unknown here. Run "git fetch origin" first, then create the release again.');
    }
    const sha = run('git', ['rev-parse', '--verify', '--quiet', `${target}^{commit}`]);
    if (!sha) block(`${target} is not a known commit. Run "git fetch origin" and pass the full SHA.`);
    if (run('git', ['merge-base', '--is-ancestor', sha, 'origin/master']) === null) {
        block(`${target} is not on master. A release ships a commit that the maintainer merged into master.`);
    }
    let version = null;
    try {
        version = JSON.parse(run('git', ['show', `${sha}:package.json`]) ?? '').version ?? null;
    } catch {
        version = null;
    }
    if (`v${version}` !== tag) {
        block(`${tag} does not match package.json at ${sha.slice(0, 7)} (${version ?? 'unreadable'}). Version the release first (/release-pr).`);
    }
}

for (const tokens of segments) {
    // Writes into guardrail files through the shell.
    const first = tokens.find((t) => !/^[A-Z_][A-Z0-9_]*=/.test(t) && !['sudo', 'env', 'command'].includes(t)) ?? '';
    if (WRITE_TOOLS.has(path.basename(first)) && tokens.some((t) => isGuarded(t) || mentionsGuardedPath(t))) {
        block('shell commands may not write, move or delete guardrail files.');
    }

    const git = parseGit(tokens);
    if (git) {
        const { sub, args } = git;

        if (sub === 'switch' || sub === 'checkout') {
            const create = optionValue(args, ['-c', '-C', '--create', '--force-create', '-b', '-B']);
            if (create !== null) {
                if (PROTECTED_BRANCHES.includes(create)) block(`do not create or reset ${create} locally.`);
                branch = create;
            } else {
                const target = positionals(args, []).find((a) => a !== '--');
                if (args.includes('--') && args.some((a) => isGuarded(a))) block('do not restore guardrail files.');
                if (target && !args.includes('--')) branch = target;
            }
        }

        if (['rm', 'mv', 'restore', 'apply', 'am'].includes(sub) && args.some((a) => isGuarded(a) || mentionsGuardedPath(a))) {
            block('git may not modify guardrail files.');
        }

        if (sub === 'commit') {
            if (PROTECTED_BRANCHES.includes(branch)) {
                block(`never commit on ${branch}. Create a topic branch from dev (see CONTRIBUTING.md).`);
            }
            const staged = (run('git', ['diff', '--cached', '--name-only']) ?? '').split('\n');
            const broad = args.includes('-a') || args.includes('--all') || /\bgit\s+add\b/.test(command);
            const pending = broad
                ? (run('git', ['status', '--porcelain', '--untracked-files=all']) ?? '').split('\n').map((l) => l.slice(3))
                : [];
            const touched = [...staged, ...pending].filter(Boolean).filter((f) => isGuarded(f.replace(/^.* -> /, '')));
            if (touched.length > 0) block(`the commit would include guardrail files: ${touched.join(', ')}.`);
        }

        if (sub === 'merge' && PROTECTED_BRANCHES.includes(branch)) {
            block(`never merge locally into ${branch}. Changes reach it through pull requests only.`);
        }

        if (sub === 'branch') {
            const destructive = args.some((a) => /^(-d|-D|--delete|-m|-M|--move|-f|--force)$/.test(a));
            if (destructive && args.some((a) => PROTECTED_BRANCHES.includes(a))) block('do not delete, rename or reset protected branches.');
        }

        if (sub === 'push') {
            handled.push = true;
            const pos = positionals(args, ['-o', '--push-option', '--receive-pack', '--exec', '--repo']);
            const refspecs = pos.slice(1);
            for (const a of args) {
                if (a === '--force' || (/^-[a-zA-Z]+$/.test(a) && a.includes('f'))) {
                    block('plain force pushes are not allowed. Use --force-with-lease on your own topic branch only.');
                }
                if (['--mirror', '--all', '--branches', '--prune', '--delete', '-d', '--tags'].includes(a)) {
                    block(`git push ${a} is not allowed. Topic branches are deleted by "gh pr merge --delete-branch"; tags are created by "gh release create".`);
                }
            }
            for (const rs of refspecs) {
                if (rs.startsWith('+')) block('forced refspecs (+ref) are not allowed.');
                if (rs.startsWith(':')) block('deleting remote branches by refspec is not allowed.');
                const dst = stripHeads(rs.includes(':') ? rs.split(':').pop() : rs);
                const target = dst === 'HEAD' ? branch : dst;
                if (PROTECTED_BRANCHES.includes(target)) block(`never push to ${target}. Open a pull request instead.`);
                if (/^refs\/tags\//.test(rs) || /^v\d+\.\d+/.test(dst)) {
                    block('tags are not pushed. "gh release create vX.Y.Z --target <commit on master>" creates the tag with the release.');
                }
            }
            if (refspecs.length === 0 && PROTECTED_BRANCHES.includes(branch)) {
                block(`this would push ${branch}. Never push to protected branches; work on a topic branch.`);
            }
            if (run('git', ['rev-parse', '--verify', '--quiet', 'origin/dev']) === null) {
                block('origin/dev is unknown here. Run "git fetch origin" first, then push again.');
            }
            const outgoing = (run('git', ['diff', '--name-only', 'origin/dev...HEAD']) ?? '').split('\n').filter(Boolean);
            const touched = outgoing.filter((f) => isGuarded(f));
            if (touched.length > 0) block(`the branch changes guardrail files: ${touched.join(', ')}. Revert them and describe the change in the PR instead.`);
        }
    }

    const gh = parseGh(tokens);
    if (gh) {
        const { group, action, args } = gh;
        const repo = optionValue(args, ['-R', '--repo']);

        if (['secret', 'variable', 'ruleset', 'auth', 'ssh-key', 'gpg-key', 'codespace', 'extension', 'alias'].includes(group)) {
            block(`gh ${group} is reserved for the maintainer.`);
        }
        if (group === 'repo' && ['edit', 'delete', 'rename', 'archive', 'unarchive', 'sync', 'deploy-key'].includes(action)) {
            block(`gh repo ${action} is reserved for the maintainer.`);
        }
        if (group === 'workflow' && !['list', 'view'].includes(action)) block(`gh workflow ${action} is reserved for the maintainer.`);
        if (group === 'release') {
            if (['create', 'edit'].includes(action)) handled.release = true;
            if (repo) block('gh release works on this repository only: do not pass --repo.');
            if (action === 'create') {
                checkReleaseCreate(args.slice(1));
            } else if (action === 'edit') {
                if (args.some((a) => /^--(tag|target)(=|$)/.test(a))) block('gh release edit may not move or rename the tag.');
            } else if (!['list', 'view', 'download'].includes(action)) {
                block(`gh release ${action} is reserved for the maintainer.`);
            }
        }

        if (group === 'api') {
            handled.ghApi = true;
            const method = (optionValue(args, ['-X', '--method']) ?? 'GET').toUpperCase();
            const writes = args.some((a) => ['-f', '-F', '--field', '--raw-field', '--input'].includes(a) || /^--(raw-)?field=/.test(a));
            if (method !== 'GET' || writes || args.some((a) => /\/merges?\b/.test(a) || a === 'graphql')) {
                block('gh api is read-only here (GET, no fields, no graphql). Use the gh pr commands instead.');
            }
        }

        if (group === 'pr') {
            if (action === 'review' && args.some((a) => a === '--approve' || a === '-a')) {
                block('the agent never approves pull requests.');
            }
            if (action === 'edit' && args.some((a) => a === '--base' || a === '-B' || a.startsWith('--base='))) {
                block('do not change the base branch of a pull request.');
            }
            if (action === 'create') {
                const base = optionValue(args, ['-B', '--base']);
                const head = optionValue(args, ['-H', '--head']) ?? branch;
                if (!base) block('always pass --base explicitly (dev for topic branches, master only for the dev release PR).');
                if (RELEASE_BRANCHES.includes(base) && head !== 'dev') block('pull requests into master come only from dev.');
                if (base === 'dev' && PROTECTED_BRANCHES.includes(head)) block(`a PR from ${head} into dev is not allowed.`);
            }
            if (action === 'merge') {
                handled.prMerge = true;
                if (args.includes('--admin')) block('merging with --admin bypasses the rules and is not allowed.');
                const selector = positionals(args.slice(1), [
                    '-b', '--body', '-F', '--body-file', '-t', '--subject', '-A', '--author-email',
                    '--match-head-commit', '-R', '--repo'
                ])[0];
                const viewArgs = ['pr', 'view', ...(selector ? [selector] : []), ...(repo ? ['-R', repo] : []), '--json', 'baseRefName', '--jq', '.baseRefName'];
                const base = run('gh', viewArgs);
                if (!base) block('could not determine the base branch of that pull request, so it is not merged.');
                if (!MERGEABLE_BASES.includes(base)) {
                    block(`this pull request targets ${base}. Only the maintainer merges into ${base}.`);
                }
            }
        }
    }
}

// Guarded operations hidden inside nested shells, eval or quoting are refused outright.
// Quoted text (commit messages, PR bodies) is ignored unless a nested shell could execute it.
const unquoted = command.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
const nestedShell = /\b(bash|sh|zsh|dash)\s+-c\b|\beval\b|\bxargs\b|\bsource\b|(^|[\s;&|])\.\s/.test(unquoted);
if (nestedShell && /\bgit\b[\s\S]*\bpush\b|\bgh\b[\s\S]*\bpr\s+merge\b|\bgh\s+api\b|\bgh\s+release\b/.test(command)) {
    block('run git push, gh pr merge, gh api and gh release as plain top-level commands so the policy can check them.');
}
if (/\bgh\s+release\s+(create|edit)\b/.test(unquoted) && !handled.release) {
    block('run gh release as a plain top-level command so the policy can check it.');
}
if (/\bgit\s+(-\S+\s+)*push\b/.test(unquoted) && !handled.push) {
    block('run git push as a plain top-level command so the policy can check it.');
}
if (/\bgh\s+pr\s+merge\b/.test(unquoted) && !handled.prMerge) {
    block('run gh pr merge as a plain top-level command so the policy can check it.');
}
if (/\bgh\s+api\b/.test(unquoted) && !handled.ghApi) {
    block('run gh api as a plain top-level command so the policy can check it.');
}

// Redirections into guardrail files (>, >>, tee).
for (const m of command.matchAll(/(?:>>?|\btee(?:\s+-a)?)\s*["']?([^\s"';&|<>]+)/g)) {
    if (isGuarded(m[1])) block(`shell redirection into ${m[1]} is not allowed.`);
}

process.exit(0);
