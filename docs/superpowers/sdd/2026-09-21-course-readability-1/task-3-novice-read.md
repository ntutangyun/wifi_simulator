# Task 3 — Novice read: amp-intro, amp-ppdu

Persona: knows frame, preamble, ack, dB/dBm, bit rate, carrier sense in rough terms; has never heard of ambient-power tags, backscatter or 802.11bp. Read-only, no edits made.

---

## amp-intro (`A tag with no battery`)

### EN

**STOP POINT:** none — read to the end without stopping. Every mechanism (envelope detector, carrier sense, NAV, CTS-to-self, ABOC draw, collision, Ack-as-clock) is explained in the same sentence it first appears, in plain words.

**UNEXPLAINED WORDS**
- `CCA_BUSY`, `BACKOFF_DRAW`, `IFS_START` ("What a tag never does") — named as log-record types the tag's lane never shows, but never told in plain words what each one records. A reader can guess they relate to carrier sense but can't be sure.
- `CTS` — used four times ("CTS-to-self", "CTS addressed to itself") with its function explained inline ("a very short frame whose whole content is a length of time") but the acronym itself (Clear-to-Send) is never expanded or put in the terms table.
- `Ack` — used before any plain definition; relies on the persona's prior rough sense of "acknowledgement," which mostly works but is never explicitly tied to the word "Ack" as a name.

**OVERLOADED PARAGRAPHS**
- "No tag can hear another, so..." — packs cause (can't hear each other), mechanism (collide in one slot), consequence (router decodes neither), and delayed discovery (via the Ack) into one paragraph.
- "Scroll a tag's lane for a whole second..." — combines the negative-evidence claim (no CCA_BUSY/BACKOFF_DRAW/IFS_START), the "ten transmissions" fact, and a comparison to the router's lane.
- "A round starts every 100 ms, so a second holds ten..." (numbers) — four separate counts (slots, Acks, answers, tag-name vs router-name Acks) land in one paragraph with no visual break.

**CONTRADICTIONS:** none found. I checked the arithmetic by hand: round = 50+10+618+4×(10+528+10+330) = 4190 µs ✓; on-air total 3044 µs + 90 µs gaps + 1056 µs unused slots = 4190 ✓; 16 tag-named Acks + 24 router-named Acks = 40 ✓ (matches 8 clean rounds × 2 tags + 2 collision rounds × 0). All self-consistent.

**WHY:** Yes. The milk-carton-sticker analogy states the problem (a battery-free sensor can't take its own turn on the air) and for whom (a device that only has a few scavenged microwatts) in words I'd use myself.

**SIMULATOR:** Sent early (fourth `picture` item, right after the two "why a tag can't listen / why the air gets cleared first" beats). The watch prompt says what I'll see: "the frame that does the asking: it opens a row of equal slots and invites any tag that hears it into one of them." A second watch prompt (jump 4) likewise tells me what to look for (the Ack at the end of a lost slot, and whose name it carries).

**QUIZ:** All three answerable from why→numbers. Q1 (why a slot, not contention) is covered in "A radio that cannot listen" + "What a tag never does." Q2 (why two losses) is covered in "Picking a slot at random" + "Where the two losses come from." Q3 (whose name closes an empty slot) is covered in "A second of polling" ("an empty or unreadable slot" gets the router's name).

**TONE:** One passage reads like a spec register description rather than a teacher: *"the trigger's window exponent ACWE is 2, so ACW = 2² − 1 = 3: each tag draws an ABOC at random from 0, 1, 2, 3 and answers in slot ABOC + 1."* This states the algebra before the plain-language idea ("each tag picks one of four numbers at random").

### ZH

**STOP POINT:** none — read to the end without stopping; it reads as writing for a learner, not a translation, throughout (colloquial touches like "这么穷的一台射频", "老老实实闭嘴那么久", "抽这一下，就是标签全部的'思考'" carry the same teacherly voice as a native course would).

**UNEXPLAINED WORDS:** same three log-record names (CCA_BUSY, BACKOFF_DRAW, IFS_START) and the untranslated "CTS" acronym carry the same gap as the English side.

**ZH sentences that read translated rather than written** (picked from the whole text; most of the lesson reads natively, these two stood out):
1. "两帧之间也没有任何靠得住的时间感。" — reads as a literal rendering of "no dependable sense of time between frames." More natural: "帧与帧之间，它也没法准确计时。"
2. "标签的时钟自己找不齐四个边界，于是由确认帧替它一个个点出来。" — "找不齐...边界" is an unusual collocation. More natural: "这四个边界，标签自己掐不准，得靠确认帧一个个替它点明。"

**VERDICT: READY.** Solid, arithmetically self-consistent, teaches in order, quiz is answerable, ZH is natural. If touched again, in priority order:
1. Gloss `CCA_BUSY` / `BACKOFF_DRAW` / `IFS_START` in one clause each the first time they appear, since they're the evidence for the lesson's central claim and currently untranslated jargon.
2. Lead the ACWE/ACW sentence with the plain idea ("each tag picks one of four numbers at random") before the algebra, not after.
3. Split "A second of polling" into two beats (totals, then the tag-named-vs-router-named breakdown) so the four numbers don't land in one breath.

---

## amp-ppdu (`A frame a tag can hear`)

### EN

**STOP POINT:** none outright, but the closest thing to one is in "Small frame, long airtime": *"the padding and the closing extension cost the same whatever the frame carries"* — "closing extension" is used with zero explanation of what it is or why a frame has one; a reader has to keep going and infer it's the 6 µs "extension" defined three paragraphs later, in the numbers section. It doesn't stop comprehension of the sentence's point (fixed cost) but it is a genuine gap.

**UNEXPLAINED WORDS**
- `closing extension` / `signal extension` — used in `picture` before being named in `numbers` ("6 µs extension every 2.4 GHz frame with a legacy preamble carries"), and even there only told that it's mandatory, never why.
- `U-SIG` — named twice ("the U-SIG a Wi-Fi 7 router adds", "The U-SIG inside that opening is why the router here is a Wi-Fi 7 device") with no plain-language line saying what it is or does, only that its presence is why the router counts as Wi-Fi 7.
- `legacy signal field` — named once in the numbers note, never defined.

**OVERLOADED PARAGRAPHS**
- "Put the halves together and a small AMP frame is mostly not its message..." — combines the fixed-cost claim, the "dwarf a handful of octets" generalisation, and the Ack-as-extreme-case comparison to an unnamed "ordinary Wi-Fi frame."
- "Four octets at 250 kb/s are 128 µs..." (numbers) — combines the Ack's internal breakdown with a second, separate comparison to the CTS's efficiency ("Three and a half times the content, under a sixth of the airtime").

**CONTRADICTIONS:** none found. I checked the numbers: AMP Trigger @250 kb/s = 32+80+64+416+20+6 = 618 µs ✓ (matches table); the fixed 138 µs (32+80+20+6) recurs correctly in both rate variants (618→258 losing 360 µs = (416−104)+(64−16)); Ack's 4 octets = 128 µs at 250 kb/s (32 bits ÷ 250 kb/s) ✓; CTS at 6 Mb/s = 44 µs is arithmetically the right value for a 14-octet legacy PPDU at that rate. The claim in `picture` that the Ack "takes longer on the air than an ordinary Wi-Fi frame saying far more" is later substantiated, not contradicted, by the CTS comparison in `numbers`.

**WHY:** Yes. "One speaks in finely shaped waveforms; the other can only tell loud from quiet... the router must talk to both in one breath" states the problem (one frame, two incompatible listeners) and for whom, in plain words, and it correctly assumes the reader already finished amp-intro (declared via `needs`).

**SIMULATOR:** Sent early (third `picture` item, right after the two-halves and Wi-Fi-half explanations). The watch prompt tells me exactly what I'll see: "Read the strip left to right: the legacy opening..., then AMP-Sync, AMP-SIG, the data octets, and the padding at the end" — matching the terms just defined.

**QUIZ:** All three answerable from why→numbers (this lesson has no `deeper` field at all, only `sources`). Q1 (padding's purpose) ← "Why the frame is padded." Q2 (Ack's 330 µs breakdown) ← "Where an Ack's 330 µs goes" in numbers. Q3 (Wi-Fi station senses energy, not a frame) ← "Uplink: the mirror image."

**TONE:** Two spots read like a datasheet rather than a teacher:
- The numbers-table row *"unprotected — every frame in this scene | 20 µs | 11-26/1519r5 §39.3.2.2"* — a standard section number sits inside the main teaching table (which is inside the word-budgeted main path), not tucked into `sources` where the other citations live.
- The formula block *"AMP Trigger @ 250 kb/s = 32 + 80 + 64 + 416 + 20 + 6 = 618 µs"* followed immediately by a component-by-component note reads as a timing-budget line from a PHY spec rather than a worked example for a learner.

### ZH

**STOP POINT:** none — read to the end without stopping.

**UNEXPLAINED WORDS:** same gaps as EN — "closing extension"/信号扩展 used before being named, U-SIG and 传统信号字段 (legacy signal field) named but not explained.

**ZH sentences that read translated rather than written:**
1. "这也正是为什么：站在标签旁边的 Wi-Fi 终端只能察觉'空中有东西'，却永远认不出那是一帧——里面没有任何一段是 Wi-Fi 射频懂得去锁的。" — "这也正是为什么：" is a calque of "This is exactly why:" with an odd colon. More natural: "正因如此，站在标签旁边的 Wi-Fi 终端只能察觉'空中有动静'，却认不出那是一帧。"
2. "填充把这段'想事情'的时间加在只花空口时间的地方——填充还在往外发的时候，标签其实已经在解码了。" — "加在只花空口时间的地方" is convoluted. More natural: "填充把这段思考时间安排在了只耗费空口时间、别无其他代价的地方；填充还在发送，标签其实已经在解码了。"
3. "把两半拼起来你就会发现：一帧小小的 AMP 帧，绝大部分并不是它要说的内容。" — mild calque of "put the halves together and you'll find." More natural: "两半合起来看就会发现，一帧小小的 AMP 帧，大半时间都花在了它本身要说的内容之外。"

**VERDICT: NEEDS A PASS.** Arithmetic and narrative order are sound and the quiz is fully answerable, but three real jargon gaps stack up (closing extension, U-SIG, legacy signal field) and one table row imports a standard citation into the graded main path. Priority order:
1. Give `closing extension`/signal extension a one-clause plain explanation at its first use in `picture`, before it's used again unexplained in `numbers`.
2. Move "11-26/1519r5 §39.3.2.2" out of the "How much padding" table (main path, word-budgeted) into `sources`, where the lesson's other citations already live.
3. Add a plain-language line for `U-SIG` (what it says, not just that its presence makes the router "Wi-Fi 7") wherever it's first named.

---

Report path: `D:\wifi_sim\.claude\worktrees\feat-link-2g\.superpowers\sdd\2026-09-21-course-readability-1\task-3-novice-read.md`
