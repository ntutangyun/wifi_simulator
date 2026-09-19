### Task 2: Device behaviour, record, view, log, inspector, editor

**Files:** modify `src/uwb/device.ts`, `src/uwb/network.ts`, `src/uwb/records.ts`, `src/uwb/view.ts`, `src/uwb/format.ts`, `src/uwb/ui/rows.ts`, `src/uwb/ui/UwbInspector.tsx`, `src/uwb/ui/UwbSessionFields.tsx`, `src/ui/i18n.ts`; tests `tests/uwb/network.test.ts` (+5), `tests/uwb/view.test.ts` (+1), `tests/ui/uwb-format.test.ts` (+1), `tests/editor/*` (+1).

Behaviour (anchor, contention round):
- On decoding the poll: if `attemptsLeft === 0` (sitting out) → set `attemptsLeft = maxAttempts`, emit `UWB_CONTEND { node, slot: null, attempt: 0 }` and stay silent this round; else draw `slot = 1 + rng.int(contentionSlots − 1)` (uniform over the response window), emit `UWB_CONTEND { node, slot, attempt }` (attempt counts from 1), and answer in that slot (SS response with RRTI as today).
- Learning the outcome: SS-TWR gives the anchor no feedback; **model**: the network tells the anchor at round end whether the tag emitted a `UWB_RANGE` for it (the tag's `endRound` returns the set of anchors heard; the network passes `heard: boolean` to each anchor's `endRound`). Heard → `attemptsLeft = maxAttempts`; not heard → `attemptsLeft −= 1` (0 = sit out next round). The lesson states this model choice and quotes §10.32.1 NOTE.
- Tag: listens through slots 1…contentionSlots (state `uwbWait` per slot as today); the channel's overlap rule (weaker doomed; both doomed within 6 dB) produces `RX_FAIL collision` at the tag; a captured response counts as a normal range.
- Records: `UWB_CONTEND { type; node; slot: number | null; attempt: number }`; `UwbNodeView.contend: { slot: number | null; attempt: number } | null` + `contendCollisions` (count of RX_FAIL collision at the tag for uwbResp — the tag's lane); log line `${node} contends: slot ${slot} (attempt ${attempt})` / `${node} sits out this round`; inspector rows; session fields: schedule select, contention slots, max attempts (EN/ZH), disabled unless method SS.
- `UWB_ROUND.slots` = the plan's slots (1 + contentionSlots).

- [ ] Tests: two anchors forced to the same slot (seed search or a deterministic RNG stub) → RX_FAIL collision at the tag, no range for either, both `attemptsLeft` decrement; an anchor 6 dB stronger in the same slot is captured → one range; after `maxAttempts` unheard rounds the anchor sits out exactly one round (a `UWB_CONTEND` with slot null) then draws again; the draw is uniform over 1…contentionSlots across 200 rounds (χ² loose bound) and identical across two runs; `schedule: 'time'` runs are byte-identical to before (hash fixture untouched); the editor fields save a valid session.
- [ ] Commit `feat(uwb): contention-based response slots with collisions, retries and sit-outs`.

---

