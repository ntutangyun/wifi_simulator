# AMP slices 2–5: backscatter, energy, energizers and sub-1 GHz — design

Date: 2026-09-21
Status: continuation of `2026-09-18-amp-tier-design.md` (its "Out of scope (next AMP slices, in order)" list). Four
independent slices, each shipping working software and one lesson; each gets its own implementation plan.

## Purpose

The first AMP slice built the **Active Tx** tag: a battery-free radio that still owns an oscillator and a transmitter.
P802.11bp's other half is the tag that owns neither — it **backscatters** the reader's own carrier — and the machinery
that keeps any of these tags alive: harvested energy, an **energizer** that radiates power on purpose, service periods
that let a tag sleep, and the **sub-1 GHz** band where a watt of power and 20 dB less path loss make ten metres
possible. This spec adds, in order:

- **A2 — Mono-static backscatter in 2.4 GHz.** The Wi-Fi AP is the RFID reader: it radiates an excitation carrier and
  listens for its own signal coming back modulated. EPC Gen2-style inventory (Query / QueryRep / ACK / Read / Write)
  tunnelled in AMP RFID frames; the reader's self-leakage and dynamic range set a reach of some tens of centimetres.
- **A3 — Energy: harvesting, the energizer and service periods.** A capacitor, a harvester and a power budget on every
  tag; an AMP Energizer node that transmits a wireless-power waveform in sub-1 GHz under the AP's control, with
  listen-before-talk and the regulatory dwell time; the AMP Service Period that lets an Active Tx tag doze.
- **A4 — Bistatic backscatter in 2.4 GHz.** The energizer radiates the excitation, the tag shifts its reply by 20 MHz
  into the neighbouring channel, the AP receives it: the 40 MHz protected four-step sequence with a group Ack, and a
  reach of metres instead of centimetres.
- **A5 — Sub-1 GHz mono-static.** An AMP AP operating at 900 MHz as an RFID-grade reader: 62.5 kb/s downlink, its
  own EDCA and NAV, RFID-class carrier cancellation, five to ten metres.

Every slice keeps the rules of the first: behaviour per the SFD and adopted PDTs where they exist, a documented model
choice where the draft is TBD, every number tagged, every lesson claim pinned, every existing scenario bit-identical.

### Source status and honesty tags

P802.11bp is at D0.5 / D1.0 letter ballot (September 2026); the drafts are members-only. Everything here comes from
the TGbp mentor corpus (`…/references/amp_tgbp/`, 851 documents; `tables/sfd_full.md` is the SFD 11-24/1613r20 by
section). Tags used in code, lessons, Guide, glossary and README:

- **SFD PM-/FM-/MM-/WM-/AM-nn** — an adopted motion in 11-24/1613r20 (cite the item).
- **PDT nn-nn/nnnn** — proposed draft text adopted or proposed for D0.5 / D1.0: 11-26/1798r1 (mono-static frame
  exchange), 11-26/1580r0 and 11-26/1581r1 (S1G mono-static MAC and receiver/CCA sensitivity), 11-25/1357r12 and
  11-26/1596r5 (energizer control).
- **TGbp 11-nn/nnnn (contribution)** — a presentation the group discussed but did not adopt as text; used only for
  numbers the SFD leaves TBD, and always tagged as such: 11-25/0307r0 (reader dynamic range 50 dB, 20 dB self-leakage,
  the mono-static and bistatic link-budget tables), 11-24/0537r0 and 11-25/0058r1 (tag activation −20 dBm,
  backscatter modulation loss 6 dB, isolation 20 dB, −35 to −50 dBr effective noise floor), 11-26/0120r0 and
  11-26/0600r0 (T1/T2/T3/T4 timing table, later adopted as PM-72…PM-90), 11-26/0125r0 (tag power consumption 50 / 10
  / 0.1 / 0.01 µW), 11-25/2061r0 (harvester 20 % efficiency, 1 µF, 1.2 / 0.9 V, cold-start table, WPT channels),
  11-26/1350r1 and 11-26/1351r1 (bistatic four-step sequence and frame fields), 11-26/1345r1 (40 MHz Type 5 PPDU),
  11-25/1581r2 (duty-cycle codepoints), 11-25/0816r0 (S1G link budget, 95 dB cancellation).
- **EPC Gen2 (ISO/IEC 18000-63)** — command names, bit lengths and the slot-counter inventory the SFD adopts by
  reference (MM-10, MM-29, FM-44).
- **regulation** — ETSI EN 302 208 / FCC Part 15.247 / MIIT 800/900 MHz RFID rules as cited in 11-25/0816r0 and
  11-25/2061r0 (power limits, dwell times).
- **model** — our choice.

Never copy standard or draft text; paraphrase and quote only numbers and field names.

### Course placement

The existing Tier 2 module 7, **Ambient power IoT (802.11bp)** / 环境能量物联网（802.11bp）, gains four lessons
appended after `amp-coexist` in `COURSE_ORDER`: `amp-backscatter`, `amp-energy`, `amp-bistatic`, `amp-s1g`. No module
or tier index moves.

## Common ground for the four slices

### Propagation for backscatter links (model)

The Wi-Fi link's indoor law (`pathLossDb` 46.7 + 30·log10 d, −6.5 dB on 2.4 GHz) is a log-distance model referenced
at 1 m; below a metre it extrapolates to *less* than free-space loss, which is not physics, and every backscatter
budget in the corpus is Friis. So:

- `bsPathLossDb(fMhz, dM, wallsDb) = 20·log10(4π·f/c) + 20·log10(max(d, 0.05)) + wallsDb` — free space at the
  carrier plus the existing wall table. 40.20 dB at 1 m for 2.44 GHz; 31.68 dB at 915.5 MHz; 31.21 dB at 867.5 MHz
  (model; the 20 dB S1G advantage is 8.5 dB of frequency plus the power the bands allow).
- Every quantity a backscatter tag or an energizer computes (activation, harvested power, the return path, the direct
  leakage) uses this law. Wi-Fi nodes keep seeing every PPDU under the Wi-Fi law as today: the two laws meet only in
  the lesson text, which says so.

### The reader model (model, from the contributions)

| Constant | Value | Tag |
|---|---|---|
| `AMP_BS_LOSS_DB` | 6 dB backscatter modulation loss (the tag reflects −6 dB of what reaches it) | 11-24/0537r0, 11-23/2038r1 |
| `AMP_BS_ISOLATION_DB` | 20 dB TX-to-RX isolation of a 2×2 Wi-Fi device in 1TX + 1RX mode | 11-25/0058r1, 11-24/0537r0 |
| `AMP_BS_READER_DR_DB` | 50 dB effective dynamic range after digital leakage removal | 11-25/0307r0 |
| `AMP_BS_REQ_SNR_DB` | { 250: 3, 1000: 9 } dB — the 3 dB minimum of 0307 and the "6 dB margin" of 0058 | model |
| `AMP_BS_ACTIVATION_DBM` | −20 dBm incident power for a backscatter tag to operate | 11-24/0537r0; PDT 11-26/1581r1 uses −20 dBm as the S1G DL sensitivity |
| `AMP_BS_TAG_PPM` | 100 000 ppm clock | SFD PM-28 / PM-46 |

The reader's effective noise floor is `leakDbm − DR` with `leakDbm = excitationDbm − isolation` (mono-static) or the
direct energizer→AP path (bistatic). A reply decodes when `rxDbm − floor ≥ reqSnr` and, as everywhere in the engine,
when nothing stronger collides with it. Consequence worth teaching: in mono-static the floor rises with the
excitation, so turning the reader up buys no reach — only isolation or dynamic range do; activation range, however,
does grow with power.

### Node configuration

```ts
// scenario.ts
export type AmpTagMode = 'active' | 'backscatter'
export interface AmpTagCfg {
  id16?: number; dlSensDbm?: number            // as today (Active Tx)
  mode?: AmpTagMode                             // default 'active'
  epc?: string                                  // backscatter: 96-bit EPC as 24 hex chars (default: derived from the node id)
  energy?: AmpEnergyCfg                         // A3; absent = the tag is not energy-modelled (today's behaviour)
  band?: '2g' | 's1g'                           // backscatter tags only; default '2g' (A5 adds 's1g')
}
export interface AmpEnergyCfg {
  storageUf: number      // default 1 (11-25/2061r0: a sticker-shaped tag holds ≤ 1 µF)
  vHigh: number          // 1.2 V (2061r0)
  vLow: number           // 0.9 V (2061r0)
  harvestEff: number     // 0.2 (2061r0)
  harvestMinDbm: number  // −20 (model: a harvester's activation)
  txUw: number           // 50 (11-26/0125r0)
  rxUw: number           // 10 (0125r0)
  csUw: number           // 0.1 — carrier-sense-only listening (0125r0)
  idleUw: number         // 0.01 (0125r0)
  startUj?: number       // initial stored energy; default: full (½·C·V_H²)
}
// AmpApCfg gains:
//   backscatter?: { q: number; ulKbps: 250 | 1000; wupMs: number; chargeDbm: number; bsDbm: number; txopMs: number; read: boolean; write: boolean }
//     defaults q 2 (Gen2 Q), ulKbps 250, wupMs 1 (PM-73 minimum), chargeDbm 10 and bsDbm 0 (0307's PEX_C / PEX_B), txopMs 4 (model), read true, write false
//   sp?: { spId: number; intervalMs: number; minWakeMs: number; startMs: number }      // A3, service period (SFD MM-32)
//   opStatus?: boolean                                                                   // A3: solicit the Operation Status report (WM-12)
//   bistatic?: { energizerId: string; shift: 'up' | 'down'; slots: number; slotUs: number; guardUs: number; excitationDbm: number }  // A4
// New node kind 'energizer' with `energizer: { wpt?: { channel: WptChannel; dbm: number; durationMs: number; intervalMs: number; lbt: boolean }; excitation?: { dbm: number } }` (A3/A4).
// Scenario gains `regDomain?: 'US' | 'EU' | 'CN'` (default 'US') for the S1G channel plan and dwell limits (A3/A5).
```

## Slice A2 — Mono-static backscatter in 2.4 GHz

### The DL PPDU with excitation (SFD PM-38, PM-63, PM-72…PM-90)

| Field | Duration | Tag |
|---|---|---|
| Legacy preamble + U-SIG | 32 µs (L-SIG LENGTH covers the whole PPDU, excitation included, so Wi-Fi defers for all of it) | SFD PM-15; 11-25/0075r2 |
| WUP-Excitation (subtype 1 only: the first PPDU of a TXOP) | ≥ 1 ms; `wupMs` | SFD PM-72, PM-73 |
| AMP-Sync for mono-static | [0 1 1 1 1 0 1 0], 8 chips × 2 µs = 16 µs | SFD PM-63, PM-10 |
| AMP-Data | AMP RFID frame octets × 8 × 4 µs (250 kb/s Manchester OOK; no AMP-SIG for mono-static) | SFD PM-65 note; 11-25/0061r0 (single DL rate) |
| BST-Excitation | `≥ 1.2·T1 + 1.1·T4` for immediate responses (T1 = 16 µs); `≥ 1.1·T3 + 1 µs + 1.1·T4` for delayed (Write: T3 = 2 ms) | SFD PM-74, PM-75, PM-86…PM-88; T3 values 11-26/0120r0 |
| Signal extension | 6 µs | model (as slice 1) |

The DL PPDU is transmitted at `chargeDbm` up to and including AMP-Data and at `bsDbm` during BST-Excitation
(model, after 11-25/0307r0's PEX_C = 10 dBm / PEX_B = 0 dBm; a reader keeps its own leakage inside its dynamic range
while backscatter is expected). Consecutive DL PPDUs inside one TXOP are 16 µs apart (T2, 11-26/0120r0; contribution).

### The UL backscatter PPDU (SFD PM-24, PM-57, PM-35, PM-17, PM-20)

Sync [S, S, S] with S = [1 1 0 1 0 1 0 0] = 24 chips; Manchester OOK data with no FEC (PM-48 codes only active
transmission); one chip per Manchester half-bit, so 2 µs chips at 250 kb/s and 0.5 µs at 1 Mb/s (model reading of
PM-35). The reply starts T1 = 16 µs after the end of AMP-Data (the tag's ±20 % is not drawn: model, nominal). It is
received only while the BST-Excitation carrier is on.

### Frames: AMP RFID frames carrying EPC Gen2 commands (SFD FM-44, FM-45, FM-24, FM-25, FM-9 note, FM-35; EPC Gen2)

DL: MAC header 5 (FC 1, ID 2 = the STA's 16-bit AMP id = CRC-16 of its EPC per FM-25, TDC 2 carrying the UL Rate field
per FM-24) + command + FCS 2. Command bodies, rounded up from the Gen2 bit lengths (EPC Gen2 → octets, model):
Query 3 (22 bits: Q and session), QueryRep 1 (4 bits), ACK 3 (18 bits: the RN16), Read 8 (memory bank, pointer, word
count, RN16, CRC), Write 8 (one 16-bit word + RN16 + CRC), Select 18 (mask of the 96-bit EPC). UL replies keep Gen2's
shapes (model): RN16 2 octets (no header, no FCS); EPC reply 16 octets (PC 2 + EPC 12 + CRC-16 2); Read reply 13
(header 1 + 8 data + RN16 2 + CRC 2); Write reply 5 (header 1 + RN16 2 + CRC 2) after T3 = 2 ms. **No DL Ack** follows
a backscatter reply (FM-35): the next command is the acknowledgement.

Airtimes at 250 kb/s UL (pinned): RN16 reply 48 + 64 = 112 µs → BST 142.4 µs; EPC reply 48 + 512 = 560 µs → BST
635.2 µs; the opening Query PPDU (with a 1 ms WUP) 1 516.4 µs; QueryRep 452.4 µs; ACK 1 009.2 µs; Read 1 063.6 µs;
Write 2 963.8 µs. At 1 Mb/s: 1 424.0 / 360.0 / 547.2 / 680.8 / 2 792.2 µs.

### The inventory round (EPC Gen2 slot-counter algorithm, tunnelled; SFD MM-10/MM-29; 11-25/0061r0)

The AP obtains an AC_BK TXOP as for an Active Tx round, fronted by a CTS-to-self whose Duration is `txopMs` (model:
11-25/0075r2 "the first PPDU in a TXOP is preceded by an initial control frame"), and runs:

1. **Query(Q)** in a subtype-1 PPDU (WUP first). Every backscatter tag that receives ≥ −20 dBm during the WUP for its
   whole 1 ms boots, decodes the Query, and draws a slot counter uniformly in [0, 2^Q − 1] from its own stream (Gen2).
   A tag whose counter is 0 backscatters its RN16 in the BST-Excitation.
2. If exactly one RN16 decodes: **ACK(RN16)** → that tag replies with its EPC; the AP records the EPC (the tag is
   *inventoried*: it sets its session flag and stays silent for the rest of the round — Gen2's A/B flag, model:
   cleared when the next Query carries a new session number, which the AP does once per `pollIntervalMs`); then, if
   `read`, **Read** → 8-octet reading; if `write`, **Write** → reply after 2 ms.
   If two or more RN16s collide (the existing capture rule: 5 dB within the sync), or nothing comes back, the AP
   proceeds after the BST-Excitation ends.
3. **QueryRep** for each remaining slot: every tag with a non-zero counter decrements; counter 0 → RN16, as above.
4. The round ends when 2^Q slots have been offered or the TXOP budget would be exceeded by the next command's PPDU;
   the AP releases the medium (post-round backoff as today). Tags keep their counters and flags across TXOPs
   (11-25/0061r0's "Extend" idea, model): the next TXOP's Query with the same session number resumes the inventory
   instead of restarting it.

Gen2's Q-adaptation (QueryAdjust) is not modelled: Q is a scenario knob and the lesson's experiment.

### Tag behaviour (mono-static)

- Powered only while the AP's PPDU is on the air: no WUP ≥ −20 dBm for 1 ms → no boot this TXOP; boots once per
  TXOP; within the TXOP, any command received below −20 dBm is not decoded (the tag needs the carrier to think).
- Reception of DL commands uses the backscatter law and the −20 dBm floor (model), not the Active Tx −72 dBm.
- Backscatters only inside the BST-Excitation; its reply power at the AP = `bsDbm − 2·PL − AMP_BS_LOSS_DB`.
- Clock 100 000 ppm is stated, not modelled as jitter (the draft absorbs it in the 20 % and the excitation margins).
- MAC states: `idle` (unpowered/listening for a carrier), `rx`, `bsWait` (counter > 0), `tx`; new `MacStateName`
  value `bsWait`.

### Coexistence

Wi-Fi nodes on 2.4 GHz see each DL PPDU as a legacy-preamble reception whose L-SIG length covers the excitation, so
they defer for the whole PPDU (as slice 1). A backscattered reply is far below −62 dBm at any Wi-Fi node: invisible to
energy detection (its power at 1 m from the tag is around −66 dBm at best). The CTS-to-self is what protects the
round; the `none` variant shows Wi-Fi landing inside a BST-Excitation and the reply lost to interference: the reply
must also clear `AMP_BS_REQ_SNR_DB` against Wi-Fi power in the AP's receive band (the existing interference sum).

### Records, view, UI

| Record | Emitted by | Fields |
|---|---|---|
| `AMP_RFID` | AP, per command PPDU | node, cmd: 'query' \| 'queryRep' \| 'ack' \| 'read' \| 'write' \| 'select', session, q?, slot (1-based within the round), bstNs, untilNs |
| `AMP_BS_COUNTER` | tag, on Query | node, counter, q |
| `AMP_BS_REPLY` | tag, when it backscatters | node, kind: 'rn16' \| 'epc' \| 'read' \| 'write', slot, rxDbmAtAp, snrDb |
| `AMP_INVENTORY` | AP, at TXOP end | node, session, slotsOffered, read: string[] (EPCs), collisions, empties, txopNs, complete: boolean |
| `AMP_BS_BOOT` | tag | node, powered: boolean, incidentDbm |

`NodeView.amp` gains `bs?: { counter: number | null; inventoried: boolean; replies: number; collisions: number; lastSnrDb: number | null }`;
the AP's `ampRound` gains `inventory?: { session; slot; read: number; collisions; empties }`. Lanes: DL RFID PPDUs
are AMP DL frames (teal) with the excitation drawn as a lighter tail; replies violet as today. Frame detail decodes the
RFID frame (command, Q, RN16, EPC) and the PPDU layout including both excitation fields. Editor: tag **mode**
(active / backscatter), EPC, and an **RFID inventory** section on the AP (Q, UL rate, WUP, charge / BS power, TXOP,
read, write). i18n EN + ZH; glossary: backscatter, mono-static, excitation (WUP / BST), EPC Gen2, Q / slot counter,
RN16, EPC, reader dynamic range, self-leakage.

### Lesson `amp-backscatter` — "A tag with no radio" / 没有电台的标签 (module 7)

Scene: `oneRoom()`, a Wi-Fi 7 router at (5, 4) with `backscatter` on (Q = 2, 250 kb/s, WUP 1 ms, 10 / 0 dBm, TXOP
4 ms, read on), four backscatter tags at 0.10 / 0.20 / 0.30 / 0.40 m from the AP (one "just inside" and one "just
outside" the 32.8 cm reply limit and the 30.9 cm activation limit), no Wi-Fi traffic. Variants: "1 Mb/s" (reach
23.2 cm); "Reader at 20 dBm charge" (activation 97.8 cm but the reply floor unchanged: the far tags boot and are not
heard); "Q = 0" (every tag in slot 0: collisions every round, nothing read); "Wi-Fi in the room" (a saturated 2.4 GHz
camera, protection `none`). Body: the draft disclaimer; what backscatter is (a switch, no oscillator, −6 dB); the
reader's problem (leakage 20 dB down, 50 dB of dynamic range, the floor that rises with the excitation — pin that the
reach is the same at 0 and 10 dBm BST power); the PPDU with two excitations and why the WUP is a millisecond; the
Gen2 inventory (counter, RN16, ACK, EPC, QueryRep) with the round's timeline (pinned airtimes); the TXOP budget and
persistence across TXOPs; what Wi-Fi sees (L-SIG covers it all). 4 observe / 2 tryThis / 3 quiz; ≤ 25 min; every
number pinned.

## Slice A3 — Energy: harvesting, the energizer and service periods

### Tag energy model (model, numbers from the contributions)

- Storage `E = ½·C·V²`; the tag is **cold** below `vLow` (0.9 V: no receiver), **charging** between `vLow` and
  `vHigh`, and **ready** at `vHigh` (1.2 V) — 0.315 µJ per charge cycle, 0.72 µJ from empty (11-25/2061r0).
- Harvest: from every PPDU or WPT waveform the tag receives at ≥ `harvestMinDbm` (−20 dBm, model), at `harvestEff`
  (20 %, 2061r0) of the incident power, integrated over the on-air time (the engine already knows every emission's
  start, end and received power). A cold tag harvests; nothing else.
- Consumption: `txUw` while transmitting, `rxUw` while its receiver is on, `csUw` while it only watches for a
  carrier (the doze of a service period), `idleUw` otherwise (11-26/0125r0: 50 / 10 / 0.1 / 0.01 µW).
- Rules: a tag answers a trigger only if it holds the energy for the whole response (`txUw × airtime`) plus the
  minimum wake; a tag that runs below `vLow` mid-round drops out (its response stops; the AP sees a failed slot); the
  **three zones** of 11-24/0826r1 fall out of the numbers — A (never accumulates enough), B (responds and retains),
  C (responds but cannot retain state between rounds — model: below a `retainUj` = 0.1 µJ margin the ABOC retry
  state is lost, so the tag draws afresh).
- Numbers the lesson pins (from `bsPathLossDb` at 2.44 GHz and the constants): the AP's own 20 dBm PPDUs deliver
  −14.2 dBm at 0.5 m (7.6 µW harvested → 94 ms of continuous illumination for a cold start, which at a 1.6 % polling
  duty is about six seconds) and fall below the −20 dBm harvester floor by 1 m. A 30 dBm S1G energizer delivers
  −1.7 dBm at 1 m (135.8 µW → cold start in 5.3 ms), −7.7 dBm at 2 m, −15.7 dBm at 5 m (132.5 ms), and drops below
  the floor at 10 m. A response costs 26.4 nJ; a receiver left on for a 100 ms poll interval costs 1 µJ — more than
  the whole store — which is why service periods exist.

### The AMP Energizer and WPT (SFD AM-3, WM-1/3/5/8/14, PM-70/80/82; PDT 11-25/1357r12; 11-25/2061r0)

- New node kind `energizer`: an EHT non-AP STA (associated to the AP like any station, so the WPT Setup action frame
  travels over the 2.4 GHz link as an ordinary management exchange) with an **energizing function** that radiates a
  single-carrier WPT waveform in sub-1 GHz (AM-3 note, PM-44).
- Control (PDT 1357r12): the AP sends `WPT Setup { startTime, durationMs, intervalMs, dbm, channel }`; the energizer
  answers `WPT Setup Response` (accept / reject); the frames are Action frames of the model's usual size (model), and
  the schedule then runs without further traffic.
- WPT channel plan (SFD PM-80, PM-82; 2061r0): US 915.5 MHz / 500 kHz (PM-82's first choice), EU 867.5 MHz / 200 kHz,
  CN 920.625 MHz / 250 kHz; `Scenario.regDomain` picks. `energizer.wpt.dbm` default 30 (2061r0; the bands allow
  36 dBm EIRP in the US and 2 W ERP in the EU / CN — regulation).
- **Dwell**: one WPT burst may not exceed the domain's channel occupancy limit — US 0.4 s, CN 2 s, EU 4 s (2061r0 /
  regulation) — so `durationMs` is clamped and the lesson shows the 400 ms cap.
- **LBT** before each burst (SFD WM-7, except RFID-only bands): CCA-ED at −55 dBm (PDT 11-26/1581r1's S1G threshold,
  applied to WPT as a model) over the WPT channel; busy → the burst is skipped (model: the next interval).
- The S1G band is a **third medium** in the engine (`src/engine/s1g.ts`): only energizers transmit on it in A3, only
  tags harvest from it; it needs no CSMA machinery, just emissions with start / end / power and the free-space law.
  A5 adds the S1G AMP AP to the same medium.

### Energy reporting (SFD WM-9, WM-12, WM-13; 11-25/0789r0; 11-26/0125r0)

- `AmpApCfg.opStatus: true` makes the trigger solicit the **Operation Status** field (WM-12): the response carries the
  transmission time the tag can sustain, `E_available / txUw`, in 2-octet units of 10 µs (encoding: model), and the
  **Operation Mode Factor** for idle (WM-13: sustain time × `txUw / idleUw`).
- Every response also carries a 1-bit **low-energy** flag (11-25/0789r0 proposal; set when E < 2 × the response
  cost) — the AP's inspector shows it; the AP does not act on it (the draft leaves scheduling to implementation).

### Service periods (SFD MM-22, MM-32, MM-35, MM-37, FM-26; 11-25/1581r2 for the codepoints)

- `AmpApCfg.sp` configures one AMP Service Period: SP ID, start, interval (default 100 ms), minimum wake duration
  (default 5 ms; 1581r2's codepoints use 5 ms / 50 ms and 7 ms / 100 ms). The AP announces it in an **SP Advert**
  frame (FM-26) at the start of each SP window, carrying the AP's 12-bit partial TSF (MM-34, MM-48) and, when it
  also solicits uplink, the trigger's parameters (FM-27).
- A tag that supports SP wakes its receiver at the SP start (its clock is ±10 000 ppm, PM-34: the AP schedules the
  advert inside 2 × the drift window, MM-35 / MM-37 — the model draws the tag's clock error once and the AP's margin is
  computed from the 10 000 ppm bound), listens for at least the minimum wake duration, and dozes (`csUw`) if no AMP DL
  PPDU arrives (MM-22). Dozing is a MAC state `doze`. A tag with no `sp` support behaves as today.

### Records, view, UI

`AMP_ENERGY { node, uj, v, state: 'cold' | 'charging' | 'ready', harvestedUj, spentUj }` on every state change and
at each round end; `AMP_WPT { node: energizer, channelMhz, dbm, startNs, untilNs, lbtBusy: boolean }`;
`AMP_SP { node: ap, spId, startNs, intervalNs, minWakeNs }`; `AMP_DOZE { node: tag, untilNs }`; `AMP_OPSTATUS
{ node: tag, sustainUs, lowEnergy }`. `NodeView.amp.energy`, `NodeView.energizer`. Editor: energy section on tags
(with a "not energy-modelled" default), energizer node kind and its WPT fields, SP fields on the AP, `regDomain` in
plan settings. Overlay: an energy bar under each energy-modelled tag. Glossary: energizer, WPT, harvester, cold start,
service period, SP Advert, Operation Status, dwell time.

### Lesson `amp-energy` — "Where the energy comes from" / 能量从哪里来 (module 7)

Scene: `hallwayHouse()`-sized room, router at (3, 4) polling every 100 ms, five energy-modelled Active Tx tags at
0.5 / 1 / 2 / 3 / 5 m starting **empty**, an energizer at (7, 4) with WPT off. Variants: "Energizer on" (30 dBm,
US channel, 400 ms bursts every second); "Service period" (SP 100 ms / 5 ms with the energizer on); "EU domain"
(867.5 MHz, 4 s dwell). Body: the disclaimer; the capacitor and its two voltages; harvesting from the AP alone (the
0.5 m tag boots after the pinned number of rounds, the 1 m tag never); the energizer's 20 dB (frequency and power),
the cold-start ladder, the dwell cap and LBT; what a response and a listening receiver cost (26 nJ vs 1 µJ) and the
service period that fixes it; the three zones seen in the run; the Operation Status report. 4 / 2 / 3; ≤ 25 min.

## Slice A4 — Bistatic backscatter in 2.4 GHz

### The four-step sequence (11-26/1350r1, 11-26/1351r1; SFD FM-30, FM-48, FM-53, PM-55 as amended by 11-26/0783r2, PM-97, PM-101, MM-51, FM-52/FM-54)

0. (optional, once per session) the AP sets the energizer's excitation function up — modelled as the same Action
   exchange as WPT Setup with `excitation.dbm`.
1. The AP protects **40 MHz** with a non-HT duplicate CTS-to-self (FM-48), then transmits a **Type 5** 40 MHz AMP DL
   PPDU (11-26/1345r1: a Type 1 PPDU whose preamble is duplicated over 40 MHz; same field durations) carrying the
   bistatic trigger: slots, slot duration, guard, UL rate, shift direction (FM-40), the **excitation delay** (PM-101)
   and the Ack type (group).
2. The AP sends an **MU-RTS TXS** Trigger (TXS mode 2) to the energizer with the excitation duration, power and the RU
   (61 / 62 = lower / upper 20 MHz) (FM-53); the energizer answers **CTS** SIFS later. Airtimes from the existing
   control-frame sizes.
3. The energizer transmits the **Type 4** PPDU on its 20 MHz: preamble 32 µs + AMP-Sync (the Active Tx sync, 80 µs) +
   a 1 Mb/s all-ones MAC header (FM-41, FM-51; 1350r1) + the **excitation** of the requested duration. Each tag that
   heard step 1 backscatters at `excitationStart + delay + (k−1)·(slot + guard)` for its slot k (MM-51; guard
   `guardUs` default 20 µs, model), shifting its reply **±20 MHz** (PM-97) into the other 20 MHz channel, where the AP
   receives it. Slot choice: ABOC as for Active Tx (the same random-access rules), or scheduled by id list.
4. The AP sends a **group Ack** (FM-52 / FM-54: slot bitmap + the ids heard) as a Type 1 PPDU on its channel.

### Link budget (11-25/0307r0's bistatic table, reproduced)

Reply at the AP = `excitationDbm − PL(energizer→tag) − 6 − PL(tag→AP)`; the AP's floor = direct leakage
`excitationDbm − PL(energizer→AP)` − 50 dB (the shift moves the leakage to the other channel; the 50 dB is the
receiver's effective rejection of it — 0307's "reader effective DR"); decode at ≥ 3 / 9 dB. With 20 dBm excitation
and the energizer, tag and AP at the corners of a right triangle: 0.7 / 0.7 / 1 m → SNR 11.0 dB; 1 / 1 / 1.4 m →
7.7 dB; 1.4 / 1.4 / 2 m → 5.0 dB; 2 / 2 / 3.1 m → 2.6 dB (below 3 dB: lost) — pinned. Activation as in A2 (−20 dBm
incident from the energizer, so the tag must sit within ~1 m of a 20 dBm energizer or be energy-modelled and charged
by S1G WPT — the lesson's second variant).

### Wi-Fi coexistence

Both 20 MHz channels are reserved by the duplicate CTS-to-self; a Wi-Fi station on either channel sets its NAV. The
UL 20 MHz channel carries backscattered energy far below −62 dBm; the `none` protection variant shows a station on the
secondary channel starting a PPDU on top of a reply.

### Records, view, UI, lesson

`AMP_BISTATIC { node: ap, step: 1 | 2 | 3 | 4, energizer, ulChannel: 'upper' | 'lower', slots, excitationNs, delayNs, untilNs }`;
`AMP_EXCITATION { node: energizer, dbm, startNs, untilNs }`; `AMP_GROUP_ACK { node: ap, bitmap: number[], ids: string[] }`;
`AMP_RESULT` gains `via: 'active' | 'mono' | 'bistatic'`. Editor: the AP's **bistatic** section (energizer, shift,
slots, slot, guard, excitation power), the energizer's excitation power. Lanes: the energizer lane carries the CTS,
Type 4 PPDU and excitation tail; the tag's reply appears on the UL channel colour. Lesson `amp-bistatic` — "Borrowing
a carrier" / 借一个载波: scene `oneRoom()` with router (5, 4), energizer (8, 4), three backscatter tags at 1 / 1.4 /
2 m from the energizer; variants "20 MHz shift down", "Energizer at 10 dBm", "No protection" with a 2.4 GHz camera.
Body: why a second radio (the reader no longer hears itself), the four steps with their pinned airtimes, the shift and
the 40 MHz reservation, the slot timing from the excitation start (no Ack per slot: MM-51 / FM-52), the group Ack, the
reach table. 4 / 2 / 3; ≤ 25 min.

## Slice A5 — Sub-1 GHz mono-static

### The AMP AP S1G (PDT 11-26/1580r0, 11-26/1581r1; SFD PM-45/59/62/66, PM-46, PM-60, PM-61, PM-63)

- A new AP capability `s1g: { channel: number; dbm: number }`: the AP owns a sub-1 GHz radio on the S1G medium of A3.
  Channel plan per `regDomain` (PM-45 CN 920.125 + 0.25·N, N = 0…19; PM-59 EU 865.1 + 0.2·N, N = 0…14, and PM-66's
  400 kHz channels; PM-62 US 902.125 + 0.25·N, N = 0…55). `dbm` default 30 (regulation: 2 W ERP / 36 dBm EIRP).
- Channel access (1580r0): EDCA with one AC (AC_BE, AIFSN 3, TXOP limit 15.008 ms); CCA-ED −55 dBm (1581r1); an
  **AMP TX Announcement** frame (Duration in 64 µs units) carried in a subtype-2 PPDU sets the NAV of other S1G AMP
  APs — modelled with two APs in the lesson's variant.
- PPDUs: no 802.11 preamble (PM-46 leaves it TBD; model: none — nothing else lives on this band in the simulator);
  DL 62.5 kb/s (PM-60) with the mono-static sync at 8 µs chips (PM-63: 64 µs); UL 250 kb/s / 1 Mb/s (PM-61) with
  the [S, S, S] sync; excitation rules as A2 (WUP ≥ 1 ms; BST per PM-87 / PM-88 — the 16 µs T1 is the 2.4 GHz value,
  applied to S1G as a model).
- Receiver (1581r1, PDT — the one place the draft gives sensitivities): tag DL −20 dBm; AP UL −75 dBm at 250 kb/s,
  −69 dBm at 1 Mb/s. The floor: `max(sensitivity, leakDbm − 95 dB)` where the leakage at the AP's own port is
  `dbm − 20 dB` (11-25/0816r0: 10 dBm of self-jammer at 30 dBm, −85 dBm after 95 dB of RF + baseband cancellation;
  contribution). Reach at 30 dBm / 250 kb/s: reply = 30 − 2·PL − 6 ≥ max(−75, 10 − 95 = −85) = −75 → PL ≤ 49.5 →
  **7.8 m** free space; through one brick wall 1.9 m (pinned).

### Coexistence on S1G

The AMP AP S1G and the energizer's WPT share the medium: the AP's CCA-ED sees a 30 dBm WPT burst from across the room
and defers for its dwell (LBT symmetric: WM-7); the lesson's variant puts the WPT channel next to the reading channel
so the two never block each other, and pins the deferral time otherwise.

### Records, view, UI, lesson

`AMP_S1G_TXOP { node: ap, channelMhz, durationNs, announced: boolean }`; `AMP_RFID` / `AMP_BS_*` / `AMP_INVENTORY`
as A2 with `band: 's1g'`; a third link lane group "sub-1 GHz" in the timeline for the S1G AP, energizer and S1G tags.
Editor: the AP's S1G section, tag band select, energizer channel. Lesson `amp-s1g` — "Ten metres at 900 MHz" /
900 MHz 上的十米: scene `longApartment()` with the router's S1G radio at 30 dBm and five backscatter S1G tags at 1 /
3 / 5 / 7 / 9 m (one through a wall); variants "A second reader" (TX Announcement and NAV), "WPT on the reading
channel" (deferral), "EU 867.5 MHz". Body: the two reasons for 20 dB, the 62.5 kb/s downlink and its airtimes, the
RFID-grade cancellation number and what it buys against the 2.4 GHz reader's 50 dB, the EDCA and NAV of an AP that
is only a reader, the dwell/LBT coexistence with WPT. 4 / 2 / 3; ≤ 25 min.

## Testing (per slice)

- A2: `bsPathLossDb`; the reader floor and reach closed forms (32.8 / 23.2 cm; activation 30.9 / 97.8 cm; reach
  independent of `bsDbm`); every airtime above; the Gen2 counter draw and decrement; RN16 collision under the capture
  rule; ACK → EPC → Read; Write's T3; the TXOP budget stopping the round and the next TXOP resuming it; the L-SIG
  deferral of a Wi-Fi station; `mode: 'active'` scenes bit-identical (timeline fixture unchanged); lesson pins.
- A3: energy arithmetic (E, zones, cold-start times from the table); harvesting only above −20 dBm and only while an
  emission is on; consumption per state; a tag refusing a response it cannot afford; the energizer schedule, dwell
  clamp and LBT skip; WPT Setup exchange airtime; the SP Advert timing inside the drift window and a tag's doze;
  Operation Status arithmetic; scenes without `energy` bit-identical; lesson pins.
- A4: the four-step airtimes; the 40 MHz CTS-to-self setting NAV on both channels; slot instants from the excitation
  start; the 20 MHz shift landing on the right channel; the 0307 table; the group Ack bitmap; lesson pins.
- A5: channel plans per domain; 62.5 kb/s airtimes; the −75 / −69 dBm and 95 dB floors and the 7.8 m / 1.9 m reach;
  EDCA on S1G (AIFSN 3, 15.008 ms); TX Announcement NAV between two S1G APs; WPT deferral; lesson pins.

## Out of scope (after these four)

The AMP-enabled (wake-up) STA and its WUR-style duty cycle (MM-11…MM-16, FM-6); security (key generation, MIC);
discovery and state transition (MM-40, MM-44); Gen2 Q-adaptation, Select masks and tag memory banks beyond one
reading; multiple energizers and their coordination; bistatic in sub-1 GHz; semi-active (amplified) backscatter tags
(11-25/0307r0); the 802.11ah preamble on S1G PPDUs; WPT channel hopping.
