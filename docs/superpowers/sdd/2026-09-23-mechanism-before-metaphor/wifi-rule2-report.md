# Wi-Fi follow-up wave — the quantities the repaired rules found

Base: d9092ec. Worktree `feat-link-2g`, branch feat/uwb-ranging. Eight Wi-Fi lessons, one
commit, no pinned number changed, no fixture touched, no UWB file touched.

## Rule 2 — quantity glossing (pool = own terms + DIRECT needs)

### `ifs` — reworded, no term added
`needs: ['airtime']`, and airtime glosses ACK and payload; nothing in that pool defines a
margin. The word was doing no work: "Those two extra slots **are the margin** that keeps it
out of the way" says the same thing twice — the quantity (two slots) is already named and
sized in the clause before it, and the table below gives 9 µs a slot. Reworded to "Those two
extra slots **are what keeps it out of the way**" / 「多出来的这两个时隙，就是让它不碍事的
那点额外等待。」 Nothing was lost and the lesson got two words shorter. No new prerequisite:
ifs leans on airtime alone, and decode-thresholds is four lessons back.

Budget: picture 608/900 · numbers 507/550 · total 1400, 25 min.

### `backoff` — reworded, no term added
`needs: ['ifs']`. "the receiver's own short pause, **one slot of margin**, and the time a
radio needs to spot a signal beginning" — the 9 µs is one of the three summands of the ACK
timeout (16 + 9 + 20 = 45 µs, §10.3.2.9), and what it covers is an answer that starts a slot
late. Saying so is strictly more informative than "margin", so the sentence now reads "one
idle slot in case the answer is late", and the timeout table's cell for that row went from
`margin` to `an answer that begins late` / 「开口晚了一点的回答」. The three pinned µs values
are untouched.

Paid for inside the same sections: backoff's own shape test caps picture + numbers at 1050
and the rewrite pushed it to 1062. Trimmed two sentences that the `steps` block already
states more precisely — "both **are** waiting … and both **follow**" → "both waiting …
both following", "a rule with no randomness **in it**", and "the counter freezes and **later
picks up where it stopped, so nobody loses the waiting already done**" → "freezes and
**resumes where it stopped, so no waiting is wasted**" (step 4 of the procedure carries the
full statement). No mechanism was compressed out.

Budget: picture 551/900 · numbers 495/550 · total 1342, 25 min (cap 1050 → 1046).

### `nav` — false positive, reworded
The English never says "margin"; the Chinese matched `余量` as a substring of **剩余量**
("remainder"). Reworded 「带的剩余量就越小」→「预告的剩余时长就越短」, which is also the more
exact Chinese: what shrinks is the announced remaining *duration*, in microseconds.

Budget: picture 586/900 · numbers 444/550 · total 1285, 25 min (unchanged).

### `tier1-project` — term added (this is the reversal of a review decision; see below)
The 3 dB margin is not a turn of phrase here, it is a step of the brief: the reader is asked
to add it by hand four times (picture, the SNR rule in `numbers`, the do-it-yourself task,
the wide-channel variant), and one quiz answer turns on it. Rewording it away would take the
arithmetic with it. So the lesson glosses it itself, as its fourth of six allowed terms:

    margin — the decibels a rung's requirement has to be cleared by before it may be used
             — 3 dB here, so no link is run at the very edge
    余量：取用某一级之前，到达的信号必须高出这一级要求的那几个分贝——这里是 3 dB，好让链路不贴着边跑

Whole-track review M2 had **deleted** this exact term as a restatement of decode-thresholds'
`rate margin`, "and both owners are in `needs`" — true only transitively. The repaired rule
2 pool is own terms plus DIRECT needs, and decode-thresholds is eight lessons back and not a
direct need of the project. Putting it in `needs` was the alternative and was rejected: the
project's `needs` already names the ten lessons of the tier it re-runs, and bolting on an
eleventh to import one word is the kind of dishonest prerequisite the brief warns about. The
test comment at tests/course/tier1-project.test.ts:75 now records the reversal and why
`saturated` stays dropped (bianchi *is* a direct need).

Rule 4 is satisfied where the picture already names it: "those few decibels **are the**
margin" / 「多出的那几个分贝**就是**余量」.

Budget: picture 636/900 · numbers 545/550 · total 1493, 25 min — the term's ~30 words went
into `picture`, which had the room; `numbers` was untouched at 545.

### `tier1-project-review` — fixed by the line above, nothing changed in the file
`needs: ['tier1-project', 'hidden', 'anomaly']`, so the project's new `margin` term is in
this lesson's direct pool. Its two uses ("each rung be justified by its requirement plus the
margin", and the same words in the marking table) now stand on a gloss the reader met in the
lesson immediately before. Budget unchanged at picture 549/900 · numbers 549/550.

### `streams` — reworded, no term added
`needs: ['width']`, which glosses the noise floor (that arm of the rule already passed) but
not sensitivity. Only the **English** used the word; the Chinese of the same sentence had
long said 「每一级所要的信号」. So the English was brought to the Chinese rather than the
other way round: "so the noise floor stays where it was and so does **the signal every rung
on the rate ladder asks for**". The quiz question and explanation carried the same word (not
graded — `practice` is outside rule 2) and were aligned for the same reason; 灵敏度 is gone
from the Chinese quiz too. decode-thresholds was **not** added to `needs`: streams builds on
width and says so, and the rung-picking step it reuses it already cites as "exactly as the
last lesson did".

Budget: picture 553/900 · numbers 379/550 · practice 345/450 · total 1277.

## Rule 4 — the naming rule's Chinese arm

### `airtime` — 确认帧 (zh name of ACK)
First appearance of 确认帧 in the Chinese main path is outcome 3, five paragraphs before the
picture names ACK. Bracketed at that first appearance: 「说清确认帧（ACK）为什么值得它占掉的
那点空口时间」. Five characters, no English change, budget untouched (1270 words).

### `backoff` — 一个期限 (zh name of ACK timeout)
Not a name at all: the Chinese gloss of `ACK timeout` opened 「一个期限：过了它，……」, i.e. "a
deadline:", which `zhTermName` cannot distinguish from a real Chinese name and then demands
be introduced in the picture. The gloss was the thing that was wrong, so it was fixed rather
than the picture: 「过了这个期限，发送方就不再指望回答，判这一帧已经丢了」. It reads better —
the term being glossed is the deadline, so restating "a deadline" was circular — and the
picture's own heading 「沉默需要一个期限」 still introduces the idea.

### `ofdma-dl` — 一片 (resource unit) and 多用户 (MU)
Two different faults under one rule.

- `resource unit` opened its Chinese gloss 「一片：……」, mirroring the English "one slice:".
  But 一片 is not what anything calls it — the real Chinese name is 资源单元, which the
  picture already introduces with a naming clause (「而其中的一块，**就是**一个资源单元」) and
  which the `RU` term below it refers to by that name. The gloss now leads with the real
  name and keeps the slice image as its tail:
  「资源单元：一次发送里分给某一台设备的那一组子载波，也就是切出来的一片」.
- `多用户` **is** MU's Chinese name, and its first Chinese appearance is outcome 2. Bracketed
  there: 「在时间轴上读出一个多用户（MU）PPDU」.

Budget unchanged at picture 553/900 · numbers 511/550 · total 1415.

## Gate

- `npx vitest run tests/course/readability.test.ts` — 1032 passed, 6 failed, all six UWB
  (`uwb-mms-numbers` numbers budget, `uwb-blocks`/`uwb-mms-numbers` margin,
  `uwb-coexist`/`uwb-nba-coexist` threshold, `uwb-intro`/`uwb-ul-tdoa` Chinese names). Every
  Wi-Fi id is green. The UWB list moves under me between runs — a separate wave owns it.
- `npx vitest run tests/course` — 2452 passed, the same 6 UWB failures, 57 of 58 files green.
- `npx tsc -b --noEmit` — clean.
- Dumps read end to end in both languages for all eight lessons.

## Not fixed

Nothing on the work list was left. No lesson had to split, and no lesson ran out of budget:
backoff was the only one that went over, and it was paid for inside its own sections without
losing a mechanism.
