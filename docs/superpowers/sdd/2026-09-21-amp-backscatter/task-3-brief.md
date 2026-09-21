### Task 3: The inventory round, the backscatter tag, records, view, log, inspector, decoder

**Files:** create `src/engine/ampReader.ts` (`AmpInventoryRound`), `src/engine/ampBsSta.ts` (`AmpBsStaMac`); modify
`src/engine/mac.ts` (the AMP hook alternates: when `cfg.ampAp.backscatter` is set the poll starts an inventory round;
if both `slots` polling tags and backscatter tags exist, alternate rounds — model), `src/engine/simulation.ts` (register
bsTag radios, construct `AmpBsStaMac` for `mode: 'backscatter'` tags), `src/model/records.ts` (`AMP_RFID`,
`AMP_BS_COUNTER`, `AMP_BS_REPLY`, `AMP_INVENTORY`, `AMP_BS_BOOT`; `MacStateName` gains `'bsWait'`), `src/model/view.ts`
(+ `NodeView.amp.bs`, `ampRound.inventory`), `src/ui/format.ts` (log lines), `src/ui/Inspector.tsx` / rows
(inspector rows), `src/ui/FrameDetail.tsx` + `src/model/frameFields.ts` (RFID frame + PPDU layout with both excitations;
byte and segment sums), `src/ui/laneLayout.ts` (labels for the two kinds, `bsWait` label), `src/scene/effects.ts`
(colours), `src/ui/i18n.ts`; tests `tests/engine/amp-reader.test.ts`, `tests/engine/amp-bs-sta.test.ts`, view/format/
frameFields/lanes (+1 each).

**Behaviour (spec "The inventory round", "Tag behaviour"):**

```ts
// ampReader.ts
export class AmpInventoryRound {  // same deps shape as AmpApRound: { nodeId, q, now, emit, timing, transmit, done }
  constructor(cfg: AmpApCfg & { backscatter: NonNullable<AmpApCfg['backscatter']> }, deps)
  get active(): boolean
  start(): void        // CTS-to-self (Duration = txopMs), SIFS, then the command sequence; sessions persist across TXOPs:
                       //   session number increments once per pollIntervalMs (a new inventory); a TXOP that ends mid-round leaves `remainingSlots`
                       //   and the tags' counters/flags in place, and the next start() with the same session resumes with QueryRep
  onRxOk(frame, from): void   // RN16 (unique in this slot → ACK next), EPC (record read → Read next if cfg.read → Write if cfg.write), Read/Write replies
  onRxFail(reason): void      // collision in a slot → count, proceed after the BST ends
}
// Per command: emit AMP_RFID at TX start; the next command begins AMP_BS_T2_NS after the previous PPDU ends (incl. the BST window);
// the TXOP budget check happens before each command: if now + nextPpduNs > txopStart + txopMs, end the TXOP (emit AMP_INVENTORY with complete: false).
// AMP_INVENTORY { node, session, slotsOffered, read: epcs, collisions, empties, txopNs, complete } at every TXOP end.
// ampBsSta.ts
export class AmpBsStaMac implements PhyListener {
  // state: powered (booted this TXOP), counter: number | null, inventoried: boolean (session flag), rn16, lastIncidentDbm
  // onRxOk(ampRfid): if not powered: powered iff the PPDU had a WUP (wupNs ≥ AMP_BS_WUP_MIN_NS) and rssi ≥ AMP_BS_ACTIVATION_DBM → emit AMP_BS_BOOT; else ignore
  //   query(session): if session changed → inventoried = false; if inventoried → ignore; counter = rng.int(2^q − 1) → emit AMP_BS_COUNTER; if 0 → reply RN16 at T1 after AMP-Data ends
  //   queryRep: if counter > 0 → counter−−; if 0 → RN16
  //   ack(rn16): if rn16 matches mine and I replied RN16 in this slot → reply EPC → inventoried = true
  //   read / write (addressed by my 16-bit id): reply after T1 / T3
  // Replies go through ch.startTx with kind 'ampBsReply' and amp.bs.incidentDbm = the DL PPDU's bsDbm as received (chargeDbm − PL is what the tag sees during data; the reflected carrier is the BST-Excitation at bsDbm − PL: incidentDbm = bsDbm − PL(AP→tag))
  // powered resets when the TXOP's CTS-to-self Duration ends (the tag has no clock: model — it is unpowered the instant the carrier stops; implement as "unpowered at the end of every DL PPDU unless the next arrives within AMP_BS_T2_NS + 8 µs").
  // MAC states: idle / rx / bsWait (counter > 0 within a TXOP) / tx
}
```

- [ ] Tests (end to end with `Simulation` on small scenes, `oneRoom()`): the opening TXOP: CTS-to-self, Query with WUP,
  RN16 at exactly AMP-Data end + 16 µs, ACK, EPC, Read; `AMP_INVENTORY.read` lists the tag; Q = 2 with four tags at
  0.1–0.3 m: counters drawn once each (replay from the tags' RNG streams as the AMP slots tests do), collisions counted
  when two draw 0; Q = 0 with two tags: every round collides, nothing read; a TXOP of 4 ms stops before the command that
  would overrun (pin the count of commands) and the next TXOP resumes with QueryRep and the same session; a new session
  every `pollIntervalMs` clears the inventoried flags; Write's 2 ms T3; a tag at 0.35 m never boots (`AMP_BS_BOOT
  powered: false` or no record — decide and document); a Wi-Fi station on 2.4 GHz defers for every RFID PPDU;
  `protection: 'none'` with a saturated station: at least one reply lost to interference (pin); view/format/rows/
  frameFields (sums equal `bytes`/`txTimeNs` for both kinds)/lanes; Active Tx scenes byte-identical (fixture).
- [ ] Commit `feat(amp): mono-static backscatter — RFID inventory round, backscatter tag, records, inspector and decoder`.

---

