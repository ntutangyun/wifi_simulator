# Batch brief — mechanism before metaphor (read first; this is your requirements)

Worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch feat/uwb-ranging. No cd elsewhere, no subagents, no `git stash`, one git command per shell call. NEVER `git commit --amend`, `git reset`, or rebase — other agents commit to this branch while you work, so HEAD may not be your commit and an amend destroys their work (it has happened). If your commit message came out wrong, leave it and say so in the report. Write commit messages with a Bash heredoc (`git commit -F - <<'EOF' … EOF`), never PowerShell here-strings. Stage with explicit pathspecs (`git add file1 file2`), never `-A`, never `-a` — and COMMIT with an explicit pathspec too: `git commit -F - -- <your files> <<'EOF' … EOF`. This worktree has ONE shared git index and other implementers stage into it while you work; a bare `git commit` sweeps their staged files into your commit under your message (it has happened, at 70ed2be). If it happens to you anyway, do NOT amend or reset — report it. Other implementers are rewriting OTHER lesson files at the same time: touch only the files named in your dispatch.

## What you are changing, and why

A reader stopped at this sentence of `decode-thresholds` and asked what it actually means:

> 发送端会挑这样一级：它的要求再加上留在手里的 3 dB，这条链路仍然撑得住；而解码时比的，是不含余量的那个要求。在 20 MHz 上这笔账可以口算……

Every claim in it was true and pinned by a test. It still could not be read: 留在手里的 / 不含余量 / 这笔账 / 灵敏度 each point at something the lesson never says. The reader's words: "有很多地方你省略过多的东西了…所以最终到底是一个什么算法，需要一个具体的描述", and, about analogies: name the real thing in brackets where the analogy stands for it — 几台跟它说话的设备（STA）.

Read `docs/superpowers/specs/2026-09-21-course-readability-design.md`, section **"Amendment, 2026-09-23 — mechanism before metaphor"**. Read both reference lessons before you write: `src/course/tier1/decode-thresholds.ts` with `tests/course/decode-thresholds.test.ts` (procedure + worked example + pins), and `src/course/tier1/roles-stack.ts` (naming at the stand-in).

## The five rules, and how each is graded

1. **No pointer phrases.** Never 这笔账 / 留在手里 / 不含余量的那个要求 / 之类 / "kept in hand" / "head arithmetic" / "the bare requirement". Name the quantity and its size at the spot.
2. **Quantities are glossed like acronyms.** If the main path uses margin/余量, sensitivity/灵敏度, threshold/门限 or noise floor/噪声地板, one `terms` entry — this lesson's or an earlier lesson's — defines it. Adding a term is normal and expected; the cap is six.
3. **A rule is a procedure.** If the lesson says how something is chosen, decided, computed or timed, it carries a `{ kind: 'steps' }` block of at least three steps on the main path (in `numbers`), in the order the engine does it, and — where the lesson has a scene — one small table that runs the procedure on one real link, value by value, ending in the answer. Not in `deeper`.
4. **Name the thing where you picture it.** The first time the lesson says 接入点 / "access point" it carries （AP）/ "(the access point, AP)"; the first 站点 / "station" carries （STA）. A `terms` word's first appearance in `picture` is either in brackets right after its plain-words stand-in, or introduced with a naming clause (……就是 X / "that is the X").
5. **Budgets.** Main path 500–1800 words, picture ≤ 900, numbers ≤ 550, practice ≤ 450, ≤ 30 minutes (`BUDGETS` in `src/course/readability.ts`; `npx tsx scripts/lesson-dump.ts <id> en` prints the line). Over the ceiling the lesson **splits** — say so in your report and ask the controller before splitting; never compress a mechanism back out.

The register does not change: plain words first, the analogy still opens the lesson, provenance still last. The procedure closes the lesson — it does not replace the picture.

## Workflow per lesson

1. Read the lesson and its test. List the pinned claims. Every pin survives.
2. Find the mechanism **in the engine**, not in the old prose: `src/engine/*.ts`, `src/uwb/*.ts`. The steps you write are the steps the code takes, in its order, with its constants. If the code disagrees with the old lesson, the code wins and you say so in the report.
3. Rewrite. Scenario builders, variants and jumps do not change (the fixtures are byte-identical and controller-owned).
4. Pin the new material in `tests/course/<id>.test.ts`: each step against the engine function or the record it names, each worked-example row against the run. Prefer proving a claim over asserting it (see decode-thresholds' shortcut test, which checks the rule across a whole RSSI range).
5. Grade without editing the controller's file:
   `MECHANISM_INCLUDE=<id1>,<id2> READABILITY_INCLUDE=<id1>,<id2> npx vitest run tests/course/readability.test.ts`
6. Read both dumps end to end: `npx tsx scripts/lesson-dump.ts <id> en` and `zh`. The ZH is written, not translated: no English word order, no pointer phrases, full-width quotes “ ”. Record the budget line.
7. `npx tsc -b --noEmit` and `npx vitest run tests/course` green.

## Commit and report

One commit per batch: `feat(course): <ids> teach the mechanism as a procedure`, ending with EXACTLY these two trailers:
```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL
```
Report to `.superpowers/sdd/2026-09-23-mechanism-before-metaphor/<batch>-report.md`: per lesson the budget line, the procedure you wrote and where in the engine it comes from, terms added, pins added, anything the engine contradicted, anything that did not fit. Return ONLY: status, SHA, one-line test summary, concerns.
