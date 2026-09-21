### Task 2: Channel physics for excitation PPDUs and backscattered replies

**Files:** modify `src/engine/channel.ts` (`RadioOpts.kind` gains `'bsTag'`; per-frame TX power over time; reader
floor for `ampBsReply`), `src/engine/phy.ts` only if a helper belongs there; tests `tests/engine/amp-bs-channel.test.ts`.

**Behaviour (model per spec "Reader model", "Tag behaviour", "Coexistence"):**

- A DL `ampRfid` PPDU radiates `chargeDbm` from its start through AMP-Data and `bsDbm` during its BST-Excitation
  (the last `bstNs` before the signal extension). The channel needs a per-frame, per-instant EIRP: add
  `txDbmAt(frame, offsetNs)` used by (a) the received power of the reply path, (b) Wi-Fi nodes' energy detection over
  the PPDU (max over the PPDU as today is acceptable: a Wi-Fi node defers for the whole L-SIG length regardless), (c)
  the Spectrum emission if one exists (2.4 GHz has none: no change).
- Wi-Fi radios receive an `ampRfid` PPDU exactly as a slice-1 DL AMP PPDU (legacy preamble at CCA_PD, L-SIG SINR,
  busy for `txTimeNs`): no change in code path; assert it.
- `'bsTag'` radios: receive `ampRfid` PPDUs only; RSSI computed with `bsPathLossDb(2440, d, walls)` at `chargeDbm`;
  floor `AMP_BS_ACTIVATION_DBM`; required SINR `AMP_DL_REQ_SINR_DB` against Wi-Fi interference as for tags today.
  They emit no CCA, cannot receive anything else.
- `ampBsReply` PPDUs: transmitted by a bsTag with a *virtual* power: the channel computes the AP's received power as
  `bsReplyDbm(frame.amp.rfidBsDbm ?? the last DL PPDU's bsDbm, bsPathLossDb(2440, d, walls))` — implement by giving the
  reply frame `amp.bs.incidentDbm` (the DL power the tag is reflecting, set by the tag from the PPDU it decoded) so
  `rxDbm = incidentDbm − AMP_BS_LOSS_DB − bsPathLossDb(tag→AP)`. Only the AP (`ampCapable`) receives it; its floor is
  `readerFloorDbm(monoLeakDbm(bsDbm))` and the required SINR `AMP_BS_REQ_SNR_DB[kbps]` against that floor plus Wi-Fi
  interference in band. Other Wi-Fi radios see the reply only as energy (never above −62 dBm: assert the geometry).
- Capture between two replies in one slot: the existing rule (5 dB within the sync).
- Receiving window: the AP accepts a reply only while its own BST-Excitation is on the air (the reply lands inside the
  PPDU the AP is transmitting — the one place the engine lets a node receive while transmitting: gate it on
  `frame.kind === 'ampBsReply'` and the AP's current DL PPDU being an `ampRfid` in its BST window).

- [ ] Tests: per-instant power (charge then BS); a bsTag at 0.3 m decodes the Query at 10 dBm and one at 0.35 m does
  not (activation 0.309 m); the AP decodes an RN16 from 0.3 m and not from 0.35 m at 250 kb/s (reach 0.328 m) and the
  boundary moves to 0.232 m at 1 Mb/s; the same boundaries at bsDbm 10 (floor rises with the excitation); two tags
  at equal distance collide, a 6 dB closer tag captures; a Wi-Fi station's CCA is busy for the whole PPDU incl. the
  excitation; a reply is never above −62 dBm at a station 1 m from the tag; an Active Tx scene's records unchanged.
- [ ] Commit `feat(amp): the channel radiates excitation at two powers and hears backscatter against the reader's own leakage`.

---

