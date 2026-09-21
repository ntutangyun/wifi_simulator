# AMP slice A2 — fix wave against the whole-branch review

Base: `fe99177`, branch `feat/uwb-ranging`, worktree `.claude/worktrees/feat-link-2g`.
One commit. All three Important findings taken as proposed; M-2…M-7, M-9 done; M-1 and M-8 left
as carries (they need the channel refactor C-1/C-2/C-3).

---

## I-1 — a poll tick during a running inventory truncates it and stamps it `complete`

**Changed.** `src/engine/ampReader.ts`:

- new field `restartPending`;
- `newInventory()` defers while the round `running` **or** `resumable` (that second half is M-4:
  a session waiting for the TXOP that resumes it is holding the tags' counters, and a tick must
  not throw it away either);
- `endTxop()` reads `complete` **before** any pending restart is applied, and applies the restart
  only once the session is neither on the air nor resumable — so the tick is honoured at the end
  of the *session*, not at the end of the first TXOP that happens to be running when it lands;
- `src/engine/mac.ts` `scheduleAmpPoll`'s comment now says the round holds the request.

**Tests.** `tests/engine/amp-reader.test.ts`:

- the reviewer's reproduction — four tags at 0.1–0.3 m, `pollIntervalMs: 10`, `txopMs: 4`, 400 ms:
  every record satisfies `read + collisions + empties === slotsOffered`, and every record stamped
  `complete: true` belongs to a session whose `slotsOffered` sum to 2^Q = 4.
  RED before the fix: *"session 1, complete at 11239600, offered all 2^Q slots: expected 3 to be 4"*.
- M-4: a new round-level bench (`readerBench`, the round driven with no medium and no tags, so
  every slot is an empty) ticks the poll clock **between** TXOPs, which EDCA never leaves open in
  an end-to-end run: the session keeps its number through to `complete`, offers all four slots,
  and only the TXOP after that is a new session. RED with the `resumable` half removed:
  *"the session is still worth another TXOP: expected false to be true"*.

## I-2 — the Inspector's inventory tally could never be seen

**Changed.** `NodeView.ampInventoryLast?: AmpInventoryView` (`src/model/view.ts`), set at
`AMP_INVENTORY` with the session number, the session's last slot and the three columns; the
Inspector shows it when `ampRound` is null (`src/ui/Inspector.tsx`), with `inspector.inventoryLast`
/ `inventoryLastHint` in EN and ZH. `records.ts`'s `AMP_INVENTORY` docstring now states that the
reader reports the tally and defers in the same instant, and that `complete` is the session's own
state which a poll tick cannot make true.

**Tests.** `tests/model/view.test.ts`:

- the hand-fed stream now feeds the engine's real order (`AMP_INVENTORY`, then the same-instant
  `MAC_STATE: defer`) and asserts the round is cleared while the tally reads on;
- a new test drives real records from `Simulation`, finds the first `AMP_INVENTORY`, applies every
  record at that same instant (asserting a reader `MAC_STATE` is among them), and asserts the
  tally is still readable and agrees with the record.
- the live-vs-replay equivalence test is unchanged and green (the new field is record-derived).

## I-3 — Wi-Fi heard RFID PPDUs at the AP's EIRP, 10 dB too loud

**Changed.** `src/engine/channel.ts` `rxDbmOf`: an `ampRfid` at a non-`bsTag` radio now returns
`linkDbm(tx, rx) − (txPowerOf(tx) − txDbmAt(frame, 0))` — the link table's law, the PPDU's own
power (the max over the PPDU, i.e. `chargeDbm`). `BsGeometry` gained `txPowerOf` (the interim home
the review names; it belongs in the folded opts object, carry C-2), wired in `simulation.ts` and
in the two test benches. Every other frame kind falls through to exactly the code it had.

**Tests.** `tests/engine/amp-bs-channel.test.ts`: the preamble-detect boundary of a CTS from a
20 dBm AP is the link table's −82 dBm; the boundary of a Query at `chargeDbm` 10 is −72 dBm —
exactly 10 dB apart — and a Query at `chargeDbm` 20 is back at −82. RED before the fix.

### The BST-window probe under the corrected power

**Result: in this room, still none — and now we can say precisely why, and show where it fails.**

The `none` variant with a saturated station and `protection: 'none'` was re-run at every corner of
the 10 × 8 m lab and at 15 and 20 dBm: no Wi-Fi frame starts inside any BST-Excitation, and every
reflection is still heard. The reason is only half a law:

- the law: inside a TXOP the reader is never off the air for longer than T2 = 16 µs < any AIFS, so
  a station that deferred once cannot get back in;
- the geometry: the only way in is to miss the preamble (be transmitting when the PPDU starts),
  and what keeps such a station out afterwards is plain energy detection **of the command**, which
  radiates `chargeDbm`. That reaches `10 − CCA_ED_DBM` down the indoor law = **6.97 m**, and the
  farthest corner of this room is 6.40 m from the reader in the middle of it.

So the pinned test now computes that 6.97 m from the constants and asserts the room is inside it,
and a second test pins the counter-example: the same reader, tag and saturated station in a 40 m
hall, the station 12 m away (past the 6.97 m, still close enough that its 15 dBm arrives at the
reader above the reply) — Wi-Fi frames *do* start inside BST windows, and the reflections they lie
across are exactly the ones the reader never reads. **A reply can be lost; it just cannot be lost
in this room.** The comment says so in as many words: a geometry result, not a law, and the lesson
must not state it as one.

## Minors

- **M-2** `inventoried` moves from the ACK to `backscatter()`, set when the EPC reply actually goes
  on the air, with a one-line comment (one source of truth with the view's `AMP_BS_REPLY` handler).
  No new test: in this slice the EPC reply cannot be lost, which is why it is a robustness move;
  the existing "a second Query in the same session finds the tag inventoried" test still pins it.
- **M-3** one sentence in `pickAmpRound`'s comment: the parity counts poll *ticks*, not rounds run.
- **M-4** done with I-1 (above), with its own test.
- **M-5** `bsSnrHint` (EN + ZH) now names both bars — 3 dB at 250 kb/s, 9 dB at 1 Mb/s — and a new
  test pins both against `AMP_BS_REQ_SNR_DB`.
- **M-6** `ampBsWriteHint` (EN + ZH): the Write's reply comes 2 ms later and the reader holds the
  carrier across the wait, so the PPDU on the lane is about 3 ms.
- **M-7** the glossary's `amp` group is plain words: `AMP_BS_LOSS_DB`, `AMP_BS_READER_DR_DB`,
  `AMP_BS_ISOLATION_DB`, `AMP_BS_ACTIVATION_DBM`, `monoLeakDbm`, `leakDbm`, `wupMs` and
  `AmpTagCfg.epc` are gone; every document tag stays. A new test forbids the two identifier shapes
  (`AMP_…` and `…Dbm/Ns/Ms/Kbps/Db/Cfg`, `Amp…`) across the whole group, while leaving the
  standard's own vocabulary (AC_BK, aSIFSTime) alone.
- **M-9** `expect(drawn).toBeGreaterThanOrEqual(0)` is now replayed from the tag's own stream
  (`new Rng(3).fork(1).int(3)`); `slotsOffered ≥ 1` is pinned to 1.
- **M-1**, **M-8** left as carries, as instructed.

## Gates

- `npx vitest run tests/engine tests/model tests/ui tests/editor` — 77 files, **848 passed**.
- `npx vitest run` — 127 files, **1940 passed**, no failures anywhere (the course implementer's
  files included).
- `npx tsc -b --noEmit` — clean. `npm run build` — clean.
- `tests/fixtures/lesson-hashes.json`: the only diff from the base is two *added* keys
  (`amp-ppdu`, `amp-ppdu#0`) from the concurrent course implementer. No existing hash moved, so
  the byte-identical guarantee holds; the fixture is not part of this commit.

## Files changed

`src/engine/ampReader.ts`, `src/engine/ampBsSta.ts`, `src/engine/channel.ts`, `src/engine/mac.ts`,
`src/engine/simulation.ts`, `src/model/view.ts`, `src/model/records.ts`, `src/ui/Inspector.tsx`,
`src/ui/glossary.ts`, `src/ui/i18n.ts` (editor/inspector sections only),
`tests/engine/amp-reader.test.ts`, `tests/engine/amp-bs-channel.test.ts`,
`tests/engine/amp-bs-sta.test.ts`, `tests/model/view.test.ts`, `tests/ui/amp-bs-guide.test.ts`.

## Concerns

- `BsGeometry.txPowerOf` is a transmit power living on a geometry object. It is the smallest
  change that makes I-3's formula available on the 2.4 GHz link and it is documented as the
  interim home; C-2 (one `ChannelOpts`) should absorb it.
- `restartPending` is only *observable* when a TXOP ends having opened no slot at all (the session
  is then neither complete nor resumable). In every other path the deferred restart is satisfied
  by the session finishing on its own. It is kept because it states the round's intent explicitly
  rather than relying on the next tick to repeat itself.
