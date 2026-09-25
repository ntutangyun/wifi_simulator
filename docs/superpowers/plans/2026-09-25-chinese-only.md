# Chinese only — remove the English half of the product

> superpowers:subagent-driven-development. One mechanical codemod first, then three independent surfaces, then the contract, then the gates.

**Goal:** the simulator and its course speak Chinese. Official terms carry their standard English name and common abbreviation in brackets at first use in each lesson — that is the only English a reader meets.

**Why:** the user's decision, 2026-09-25: "maintaining a separate english version is too expensive in terms of token as well as your time. I don't even switch to EN language." Two follow-up rulings from the same exchange: the change covers **everything** (lessons, study guide, UI chrome, inspector, editor, log labels — the EN/中文 toggle goes), and the **word budgets are dropped**, leaving the ≤ 30-minute cap and the section rules as the only length control.

**What does NOT change:** the engine, every scenario, every recorded timeline hash, and every pinned number. This is a presentation change; `tests/fixtures/*.json` must come out byte-identical.

## Global constraints

- `L10n` disappears. `{ en, zh }` becomes the Chinese string, everywhere, and the Chinese text is preserved **byte for byte** — a codemod, not a rewrite. Any lesson whose prose an agent is tempted to improve is out of scope for that agent.
- The English half is deleted, not archived in comments. `git log` holds it; `721984e` is the last bilingual commit.
- Every claim stays pinned. Where a test asserts on `.en`, it asserts on the string; where it asserted the two halves agree, it goes.
- `lessonWords`, `lessonBudget`, `BUDGETS` and the section ceilings are deleted. `lessonMinutes` is recalibrated on Chinese characters and keeps its 30-minute cap.
- The rules that survive are the ones about substance: one procedure as steps, and `ZH_TERMS` (every official term carries its English at first use), plus the lesson-as-data checks. The user's later ruling — minimise tests about how text reads — retires quantity glossing, first-use naming, acronym walks, citation placement and paragraph density along with the budgets. See `docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md`.
- The rules that go are the ones about the bilingual pair: the both-languages walk, the parity checks, and the language-neutral-cell machinery (`N()` exists only to mark `en === zh`).

## Tasks

- **T0 — the codemod (one agent, scripted).** `L10n` → `string` across `src/` and `tests/`: 53 lesson files, `lessonKit.ts`, `CoursePanel.tsx`, the helpers (`J`, `N`), `terms[].plain`, quizzes, jump labels. Written as a script that transforms the object literals, run once, with a verification pass that every surviving string is byte-identical to the `zh` it came from. Gate: `tsc` clean on `src/course`, fixtures untouched.
- **T1 — the UI (one agent).** `STRINGS: Record<Lang, Strings>` → one table; `useStrings()` returns it; `Lang`, `lang`, `setLang` and the persisted `wifi-sim.lang` key leave the store; the EN/中文 buttons leave the header; `Guide.tsx` and `EditorGuide.tsx` keep their Chinese bodies only. Gate: `tsc` clean, the app builds, the store tests pass.
- **T2 — the contract (controller).** Delete the budget machinery and the bilingual rules from `src/course/readability.ts`, `tests/course/readability.test.ts` and `tests/course/kit.ts`; recalibrate `lessonMinutes` on CJK characters against a measured reading speed; update the spec. Every surviving rule must be watched failing once more, since their inputs change shape.
- **T3 — the sweep (one agent).** Everything left: `scripts/lesson-dump.ts` loses its language argument, remaining `.en`/`.zh` references, dead imports, stale comments naming "both languages".
- **T4 — terminology, re-run.** The Z1–Z3 waves stopped for this refactor are re-dispatched against the Chinese-only lessons: 554 sites, the `ZH_TERMS` rule unchanged.

## Order and risk

T0 first and alone — it touches every file the others need. T1 is independent of T0 once the type lands. T2 waits for T0 (its inputs change shape). T3 last. T4 after the branch is green.

The one real risk is silent Chinese text loss in T0: a mis-written transform that drops a string or keeps the English half. The verification pass is not optional — it compares the post-codemod string against the pre-codemod `zh` for every site, and the agent reports the count it verified.
