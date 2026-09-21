# Task 2 novice read: `uwb-intro` and `uwb-frame`

Persona: an engineer who has done the early Wi-Fi lessons (knows frame, preamble,
acknowledgement, dB/dBm, bit rate, MAC address) and has never heard of UWB or
ranging. Read top to bottom, English first end to end, then Chinese on its own.

## `uwb-intro` — "A radio that measures time"

### STOP POINT (EN)
Read to the end without stopping. The only near-misses: the "Single-sided
two-way ranging" formula heading in `numbers` lands cold (no plain name given
to the technique before then), but the immediately preceding paragraph ("Two
clocks that do not agree") has already said in plain words "the round trip
minus the reply is two flights," so the formula reads as a restatement, not a
new idea — it doesn't actually stop the reader.

### STOP POINT (ZH)
Read to the end without stopping. Same near-miss as EN, same mitigation.

### UNEXPLAINED WORDS
- **chip** — used as an exact unit ("A 499.2 MHz chip," "one chip of timing
  error," in the Units table) but never given a plain-language definition
  anywhere in this lesson. `terms` defines RCTU as "one tick of the ranging
  clock" and separately says "2⁻⁷ of a chip," so a chip and an RCTU are tied
  together numerically but "chip" itself — that it is one elementary pulse of
  the code, the countable unit the whole lesson's precision rests on — is
  never stated. The reader can infer it loosely from "Clicks instead of
  tones" (short pulses), but the word-to-concept link is never made explicit.
- **poll** — "the phone sends a poll" (first watch prompt) is the first use;
  never glossed as "the first ranging frame, the one that starts the round."
  Inferable from context (sends → answers), but not explained.
- **threshold** — "the moment a pulse crosses a threshold is uncertain" — a
  reasonable ask for an engineer-reader, borderline unexplained, not a real
  obstacle.
- **sigma** — the `observe` line "against 2.1 cm of range-noise sigma" uses
  the Greek-letter jargon with no gloss. Worth noting: the ZH sentence for
  the same line says "测距噪声的标准差" (explicitly "standard deviation"),
  which is clearer than the English "sigma" — the two languages are not
  equally readable at this one spot.

### OVERLOADED PARAGRAPHS
- The formula note: "Tround is one subtraction on the phone's clock..." packs
  four ideas into one note — what Tround is, what Treply is, the 2 ms ± Tprop
  relationship, and the "cancels" conclusion. Each sentence is short, but a
  first-time reader has to hold four facts before the payoff lands.
- `why`: "Your phone can already tell you how far it is from a Wi-Fi
  router..." runs the problem, the cause, the UWB pivot, and a preview of the
  lesson's content in one paragraph. Acceptable for an opening `why`, but it
  is doing four jobs at once.

### WHY
Yes. It states the problem in the reader's own vocabulary (phones already
estimate distance from signal strength; that's unreliable because of
obstacles) and names who benefits (anyone who wants a distance number that
doesn't depend on what's in the room), before naming UWB as the alternative.

### SIMULATOR
The first `watch` (`jump: 0`) fires right after "Clicks instead of tones" —
before the RMARKER mechanism, the two-clock explanation, or the noise
discussion. Its instruction: "Load the simulation and press play... Zoom the
timeline until the tiny gap between the two lanes shows — that gap is the air
between them." That tells the reader exactly what to look for (a visible gap
standing for distance) before they've been told how the four timestamps turn
into a number. Well placed.

### QUIZ
All three quiz questions are answerable from `why` through `numbers` without
opening `deeper` or `sources`:
- Q1 (why time, not strength) — from `why` / "Loud is not the same as near."
- Q2 (RCTU value/distance) — from the `numbers` "Units" table.
- Q3 (17 ns vs 16.678 ns) — from the `numbers` rounding paragraph.

### ZH — sentences that read as translated
1. "两端都不去记自己这一帧的开头或结尾，它们记的是帧里同一个地标——RMARKER，
   每一帧测距帧**往里走一小段之后**、双方约定好的那一个瞬间。" — "往里走一小段
   之后" is a calque of "a little way into." More natural: "在每一帧测距帧内部
   稍靠前一点、双方事先约定好要一起打时间戳的那个瞬间。"
2. "手机记下自己何时发出 Poll、何时收到回答；锚点记下的是**镜像的两笔**。" —
   "镜像的两笔" reads as a literal rendering of "the mirror image." More
   natural: "锚点记的两笔正好反过来。"
3. "超宽带：把极短的脉冲铺在极宽的频段上，因此脉冲到达的那一刻**可以被精确
   认定**。" — passive "被...认定" is stiffer than the rest of the lesson's
   voice. More natural: "所以能准确地认出脉冲到达的那一刻。"

Aside from these, the ZH reads as written-for-a-learner Chinese, not
translated: idiomatic choices like "响，不等于近," "发出的是嗒，不是嗡,"
"藏在一个完美场景里的那一课," and "撤掉这份宽容" are genuine localizations,
not literal renderings.

### TONE
The `numbers` "Units" table cites standard clauses inline in its "Where"
column — "the HRP UWB PHY, Clause 16," "the ranging counter, §10.29" — inside
the main teaching path rather than confined to `sources`. It's a small
lapse into datasheet register in an otherwise conversational lesson.

### VERDICT: READY
Priority polish (none blocking):
1. Add a one-line plain-language anchor for "chip" (e.g. in `terms` or the
   first time it's used in `numbers`) — it's the unit the whole lesson's
   precision claims rest on.
2. Replace "sigma" in `observe` with "standard deviation," matching the ZH.
3. Split the four-idea formula note into two shorter sentences.

---

## `uwb-frame` — "What a ranging frame is made of"

### STOP POINT (EN)
"Open the poll in the frame detail view and read the segments right to
left. The PSDU comes last, and it is shorter than the run of SYNC that
opens the frame..." (second `observe` item) — this contradicts the layout
the lesson just built. The `picture` watch prompt said: "Read the coloured
strip from left to right: the long run at the head [SYNC] ... then the
header and, right at the end, the message [PSDU]." That places PSDU at the
right end. If you now read "right to left," the first segment you meet is
PSDU, not the last — so "the PSDU comes last" doesn't square with the
reading direction just given. (Checked against the task brief: the intended
line was "open the poll in frame detail: the PSDU is the last and smallest
segment," with no reading-direction flip — so this looks like a drafting
slip, not an intentional device.)

### STOP POINT (ZH)
Same sentence, same problem: "在帧细节视图里打开 Poll 帧，从右往左读那些分段。
PSDU 排在最后..." — "从右往左" directly contradicts "排在最后" given the
left-to-right layout established earlier in the ZH picture text ("把那条彩色
的带子从左读到右：...最后才是消息").

### UNEXPLAINED WORDS
- **chip** — same gap as `uwb-intro`: used as a precise unit ("The RMARKER is
  the first chip after the SFD ends," "512 chips of silence," "64 × 512
  chips") but never defined in either lesson's `terms`.
- **symbol vs. chip, unreconciled units** — the "What 197.628 µs is made of"
  table gives SYNC/SFD/PHR in "symbols" and the STS rows in "chips," and the
  two units are never connected. A reader who checks the numbers notices SYNC
  (64 symbols, 65.128 µs) and STS (64 × 512 chips, 65.641 µs) land on almost
  the same duration by wildly different counts, with no stated conversion
  (implicitly ~512 chips/symbol). Not glossed anywhere.
- Related: "The radio sends 240 data bits, adds 48 parity bits and a
  2-symbol tail, and spends a whole symbol on each of them" (the PSDU-timing
  paragraph) uses "symbol" for what must be a much shorter unit than the
  ~1017 ns SYNC/PHR symbol (the stated 1.979 µs gap over 50 units implies
  ~40 ns each) — the same word is quietly doing two different jobs and the
  text never says so.

### OVERLOADED PARAGRAPHS
- "Only now does the frame say anything at all..." (the header-and-message
  paragraph) bundles PHR's role, PSDU's role and byte counts, and the
  lesson's thesis ("a ranging frame is not a way of moving data...") into one
  paragraph — three separable claims.
- "The poll's PSDU is 30 octets at 6.81 Mb/s..." bundles the rate-vs-duration
  discrepancy, the 240/48/2-symbol breakdown, and the coding-cost conclusion
  in one paragraph, and (see above) the arithmetic doesn't visibly reconcile
  with the units used elsewhere in the lesson.

### WHY
Yes. It states the puzzle in the reader's own terms (this frame is long but
nearly empty — longer than a Wi-Fi ACK, which the reader already knows) and
promises a payoff (you'll know where the RMARKER is and why).

### SIMULATOR
The `watch` (`jump: 0`) fires after two `picture` paragraphs (SYNC/SFD, then
STS), before PHR/PSDU and before the RMARKER-placement and slot paragraphs.
Instruction: "Read the coloured strip from left to right: the long run at the
head, the short marker that closes it, the sequence in the middle, then the
header and, right at the end, the message." It does tell the reader what
they'll see and in what order — well placed, sent early enough to look
before the mechanism (header, message, RMARKER) is fully explained.

### QUIZ
All three are answerable from `why` through `numbers`:
- Q1 (RMARKER position, 73.269 µs) — from the "Where the stamp goes"
  paragraph and the numbers table/arithmetic.
- Q2 (STS purpose) — from "A sequence nobody can forge."
- Q3 (why the message is so small) — from "The header and the message" and
  the closing thesis sentence.
(This lesson has no `deeper` section, so nothing to exclude there.)

### ZH — sentences that read as translated
1. "整帧里唯一一处双方都能精确到码片零头、共同说出口的边沿，就是它们采用的
   那一处。" — a literal, clause-stacked rendering of "The one edge both can
   name to a fraction of a chip is the edge they use." More natural: "整帧
   里，只有这一道边沿，双方都能精确到码片零头地说清楚——所以时间戳就打在
   这里。"
2. The observe contradiction sentence itself reads awkwardly for the same
   reason as the EN: "从右往左读那些分段。PSDU 排在最后" — fixing the EN
   fixes this too.
3. "会话并不让这两帧尽可能紧挨着走。" is a slightly stiff rendering of "The
   session does not let the two frames follow each other as closely as they
   could" — workable but a shade formal next to the rest of the paragraph's
   voice. More natural: "这两帧本来可以挨得更近，但会话不让它们那样做。"

Otherwise natural: "先锁住，再去听," "占住一个确定位置," "这里的安全性是
一种计时上的性质，而不是对消息做加密" are well-localized, not literal.

### TONE
Mostly consistent teacherly voice; the numbers table itself (field name +
symbol/chip count + duration + one-line purpose) is spec-sheet-shaped by
necessity of the content, but it's introduced and closed by prose that keeps
it from reading like a datasheet dropped in cold. No strong standalone
violation found beyond what's inherent to a duration table.

### VERDICT: NEEDS A PASS
Priority fixes, in order:
1. Fix the `observe` contradiction: either restore "left to right" (matching
   the `picture` watch and the brief's original intent — "the PSDU is the
   last and smallest segment") or, if right-to-left is genuinely intended,
   add a sentence explaining why the scan direction flips and what "last"
   means when scanning backward.
2. Reconcile "symbol" and "chip" as units in the numbers table and the PSDU
   paragraph — at minimum, one sentence stating that a symbol is many chips
   long, and that the PSDU's "symbol" is a different, shorter duration than
   SYNC's, so the reader isn't left doing unexplained unit arithmetic.
3. Give "chip" a plain-language anchor (shared fix with `uwb-intro`) — it is
   the unit the RMARKER placement and every duration in this lesson's table
   depend on, and it is currently never defined.

---

Report path:
`.superpowers/sdd/2026-09-21-course-readability-1/task-2-novice-read.md`
