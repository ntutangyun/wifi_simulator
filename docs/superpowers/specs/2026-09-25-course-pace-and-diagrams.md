# One topic per lesson — pace, diagrams, and what the tests are for

The user's brief, 2026-09-25, after the Chinese-only decision:

> a chinese only (but with standard english translations, abbreviations) website with appropriate course pace (without word count limit in each course) — so each course shall only focus on one small topic and make it clear, simple to understand, with the help of illustrative diagrams wherever applicable. again there is no need to use intuitive metaphor all over the place. and whenever you use, you should label them using () with the standard names they are actually referring to. … the sub-agents are actually editing many tests that's related to checking the display of the text. minimize those tests, focus tests on the functionality and software logic instead.

## What a lesson is now

- **One small topic, made clear.** A lesson teaches one thing. If it teaches two, it is two lessons. The course gets longer in lesson count and shorter per lesson; that is the intent, not a side effect.
- **No word limit.** `BUDGETS`, `lessonWords` and the section ceilings are gone. A lesson is as long as its one topic needs and no longer. The old ceiling is what squeezed mechanism out of the prose in the first place; the answer to "this lesson is too long" is now to split it, never to compress it.
- **Diagrams wherever they help.** A picture that shows a layout, a wrapping, a timeline or an exchange beats the paragraph that describes it. Five kinds: topology, stack, timing, sequence, field layout. Declarative data rendered to inline SVG, **derived from the run wherever the figures exist**, so a diagram cannot drift from the simulator.
- **Metaphor is seasoning, not the meal.** Use one where it genuinely lands, not in every section. Whenever a metaphor or a plain-words stand-in is used, the real name follows it in brackets: 一段固定的图案——前导码（preamble）. A stand-in without its name is the defect this whole programme started from.
- **Chinese only, with the standard names.** Every official term carries its standard English name and common abbreviation at first use in each lesson.

## What the tests are for

The suite had grown a large body of assertions about how text *reads* — word counts, paragraph lengths, acronym density, naming clauses, bracket shapes, bilingual parity. They found real defects, but they are not what a test suite is for, and they cost more to maintain than they return now that one person writes and reads the course.

**Keep — these test the software:**
- every engine, model, scene, editor, player and UI test;
- every lesson claim pinned against the engine or a recorded run. A lesson saying "the frame goes out at MCS 3" is a claim about the simulator, and the pin is what catches it drifting. These caught every real defect of the last pass and they stay.
- the shape of a lesson as *data*: required fields present, ids unique, `needs` pointing at real lessons, jump predicates matching a record in the run, scenarios passing the schema, fixture hashes unchanged.

**Delete — these test the prose:**
- word and character counts, section budgets, minute estimates as assertions;
- paragraph length, term density, acronym-introduction walks, first-use naming shapes;
- bilingual parity and language-neutral-cell machinery (already meaningless);
- any assertion whose failure message is about how a sentence is written rather than about what the simulator does.

**Two content rules survive**, because they encode the user's brief rather than a style preference, and both are cheap:
1. every official term carries its English name at first use in a lesson (`ZH_TERMS`);
2. a lesson that states a rule carries it as a procedure the reader can re-run.

Everything else about readability moves from the test suite to the author's judgement and the review pass.

## Order of work

1. Finish Chinese-only: the codemod, the contract shrink (which is where most of the deletions happen), the sweep, the gates.
2. Build the diagram block and its five renderers; pilot on the lesson that motivated it.
3. Re-pace the course: split lessons to one topic each, add diagrams, fold the terminology pass into the same edit rather than running it twice.

AMP stays paused throughout.

## Standing corrections — facts that were wrong once

Deleting the prose greps removed the only automated guard on a class of claim
that has **no engine counterpart**: a statement about the standard, or about
naming, that was corrected after someone got it wrong. A pin on such a claim
could only ever have been a grep, and greps over lesson text are what the user
asked to be rid of. So the list moves here, where an author or a reviewer
looks, and the guard becomes the review pass rather than the suite.

Each of these was wrong in a shipped lesson and was corrected. If a rewrite
reintroduces one, the course has gone backwards:

- Until Wi-Fi 6, one transmission served one receiver. Multi-user downlink is
  not a thing earlier generations did quietly.
- The generation label is **Wi-Fi 5 (802.11ac)**, written that way, not by
  clause number alone.
- Scheduled uplink (OFDMA with a trigger frame) is **no longer CSMA at all**
  for the devices being triggered — they answer when told, they do not contend.
- `mlo`'s depth names **EMLSR**, the mode a real multi-link device uses, so the
  lesson is not read as describing all multi-link behaviour.
- `DIFS` is the **DCF** interframe space (§10.3.2.3.5), not "distributed".

Corrections that DO have an engine counterpart are pinned and need no list:
the flat 11.1/11.8/11.1 % failure rates, OFDMA's win being 1.44 ms of air
rather than throughput, 162 of 169 ack rounds, the sensor being the oldest
radio in the flat, the 2 ms fragment gap, the 600 RSTU floor belonging to MMS
rounds alone, and the retry-limit drop branch.
