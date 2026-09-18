# AMP tier (IEEE P802.11bp Ambient Power, Active Tx) and the 2.4 GHz link: design

Date: 2026-09-18
Status: approved direction (unified Wi-Fi + AMP + UWB platform, one repo); this spec covers the first AMP slice.

## Purpose

Add ambient-power IoT to the simulator and the course: battery-free tags that never contend, answer only when an AP
solicits them, and share the 2.4 GHz channel with ordinary Wi-Fi. The slice is the **Active Tx non-AP AMP STA** mode
of P802.11bp in 2.4 GHz, modelled after the TGbp Specification Framework (11-24/1613r20, frozen July 2026) and the
proposed draft text adopted for D0.5 (triggering procedure 11-26/1519r5, UL channel access 11-26/1889r4). Backscatter
(mono-static and bistatic), the energizer, wireless power transfer, energy harvesting, AMP-enabled (wake-up) STAs,
service periods and security are later slices.

The slice also adds what AMP cannot exist without: a **2.4 GHz link** with ERP timing and 2.4 GHz path loss. Ordinary
stations may operate on it, which is the seed of roadmap sub-project D (legacy PHYs / 2.4 GHz).

### Where this lives in the platform

The agreed platform layout is `src/core` (house, editor, scene, timeline infrastructure, course kit, i18n),
`src/wifi` (engine, records, lessons) and later `src/uwb`, with the rule that core never imports a technology. AMP is a
feature tier of the Wi-Fi engine, so this slice adds files under the existing tree (`src/engine/amp*.ts`,
`src/course/amp/`) and does **not** move anything. The core/technology extraction is sub-project zero of the UWB work,
when a second engine exists to shape it.

### Source status and honesty rule

P802.11bp is a draft (D0.5 May 2026, D1.0 letter ballot September 2026). Every AMP number in engine constants and
lesson text is tagged with its source: **SFD** (an adopted motion), **PDT** (draft text adopted or proposed for D0.5)
or **model** (our choice where the draft is TBD or the receiver requirements are not public). Lessons say so in one
sentence and cite the document numbers. When the draft changes, the constants and the lesson text change together.

## Standard alignment rules that apply

- Behaviour per the SFD/PDT where adopted; where TBD, a selectable or documented model choice.
- The engine stays a superset of ns-3 wifi (ns-3 has no AMP; the 2.4 GHz ERP timing matches ns-3's `WIFI_STANDARD_80211g`).
- Any lesson text a change makes untrue is fixed in the same slice. Existing 5 GHz scenarios must replay bit-for-bit
  (their timeline hash is the regression test).

## Part A — the 2.4 GHz link

### Link plan

- `LinkId` becomes `'2g' | '5g' | '6g'`. A station's link is `caps.linkId` (default `'5g'`); MLO stations stay on 5g + 6g
  (tri-band MLO is out of scope). AMP tags are always on `'2g'`.
- The AP is a member of every link that has at least one other member (a tri-band router has a 2.4 GHz radio whenever
  something uses it). With only 5 GHz nodes nothing changes: same virtual ids, same records.
- Virtual ids: `id#2g` on the 2.4 GHz link (`id#6g` stays). `nodeDisplayName` appends " · 2.4G".
- Generations allowed on 2g: `nonht` (labelled 802.11g / ERP-OFDM), `he`, `eht`. `vht` is 5 GHz only. Maximum width on
  2g is 40 MHz.

### Timing per link (`PhyTiming`)

| Constant | 5/6 GHz OFDM (clause 17) | 2.4 GHz ERP-OFDM (clause 18, Table 18-5) |
|---|---|---|
| aSIFSTime | 16 µs | 10 µs |
| aSlotTime | 9 µs | 9 µs (short slot) |
| DIFS = SIFS + 2·slot | 34 µs | 28 µs |
| aRxPHYStartDelay | 20 µs | 20 µs |
| AckTimeout / CTSTimeout = SIFS + slot + RxPHYStartDelay | 45 µs | 39 µs |
| aSignalExtension (§10.3.8) | 0 | 6 µs, appended to every PPDU's TXTIME |
| EIFS = SIFS + DIFS + ACK@6 Mb/s | 94 µs | 10 + 28 + (44 + 6) = 88 µs |

`WifiMac` takes a `timing: PhyTiming` in its config (default OFDM 5 GHz) and uses it everywhere the module constants
are used today (31 sites in `mac.ts`). PPDU airtime on the 2g link includes the signal extension (PHY-TXEND fires after
it, §19.3.2), which the MAC applies once when it builds a frame. Model choice: the extension is applied to every PPDU
format on 2.4 GHz including EHT and the AMP DL PPDU (PDT 11-26/1519 notes the AMP padding "adapted if aSignalExtension
is included in the TXTIME computation").

### Propagation

Free-space loss at 1 m is 20·log10(4π·f/c): 46.7 dB at 5.2 GHz (current constant), 40.2 dB at 2.44 GHz. The 2g link
applies `LINK_EXTRA_LOSS_DB['2g'] = −6.5` the way 6g applies +1.2 today. Wall attenuation stays the same table (model
simplification, stated in the lesson: brick and drywall lose a little less at 2.4 GHz in practice). Noise floor uses the
existing formula with the PPDU width.

### UI

- Editor: a **Band** selector on stations (2.4 / 5 / 6 GHz) where the generation allows it; the object list and lanes
  show the band suffix.
- No other UI change; lanes are keyed by virtual id already.

## Part B — AMP (Active Tx, 2.4 GHz)

### Roles and nodes

- **AMP AP**: the scenario's AP, generation `eht` (the AMP DL PPDU carries U-SIG, SFD PM-15/PM-37), with an
  `amp: AmpApCfg` on its `NodeCfg`. It runs the AMP polling function on its 2.4 GHz MAC.
- **AMP tag**: `NodeCfg.kind = 'amp'`, an Active Tx non-AP AMP STA (SFD AM-2). It receives only AMP DL PPDUs, has no
  carrier sense and no NAV, transmits only in response to an AMP triggering frame (PDT 39.4), and has a 16-bit AMP
  identifier (SFD FM-17). Its `txPowerDbm` defaults to 0 dBm (model). Its DL receiver sensitivity `amp.dlSensDbm`
  defaults to −72 dBm (model: an envelope detector; the draft's receiver minimum sensitivity is not public).
- Ordinary Wi-Fi stations on 2g coexist with the round through CCA, the L-SIG of the AMP DL PPDU and the NAV of the
  AP's protection frame.

```ts
interface AmpApCfg {
  pollIntervalMs: number        // default 100: how often the AP starts an AMP round
  slots: number                 // N, default 4 (SFD FM-9 Number of Slots)
  acwe: number                  // ACW = 2^ACWE − 1, default 2 (PDT 39.3.2.1)
  dlKbps: 250 | 1000            // DL data rate (SFD PM-9), default 250
  ulKbps: 250 | 1000 | 4000     // UL data rate the AP dictates (SFD PM-17), default 250
  protection: 'ctsSelf' | 'none' // CTS-to-self covering the round before the trigger (model; FM-48 mandates it for bistatic)
  readMode: 'inline' | 'twoPhase' // inline: the random-access response carries the reading (PDT: slot sized for a frame body);
                                  // twoPhase: ID-only random access, then a scheduled trigger for the tags heard (SFD MM-26)
}
```

`NodeCfg.amp` on a tag: `{ id16?: number; dlSensDbm?: number }` (id16 defaults to a hash of the node id).

### The round (AP side)

An AMP round is one frame exchange sequence, obtained by the AP's **AC_BK** EDCAF (the PAR: AMP communication in
2.4 GHz uses AC_BK). When a round is due the BK EDCAF transmits the round instead of BK data; the round is exempt from
the BK TXOP limit the way a triggered round is one exchange. Post-round backoff follows as after any exchange.

```
[CTS-to-self 6 Mb/s, Duration = rest of round]  SIFS
AMP Trigger (DL AMP PPDU, random access, N slots, ACWE, slot duration, UL rate)
  AMP SIFS  slot 1 (D)  AMP SIFS  AMP Ack₁   AMP SIFS  slot 2 (D)  AMP SIFS  AMP Ack₂ … slot N  AMP SIFS  AMP Ack_N
[twoPhase: AMP SIFS  AMP Trigger (scheduled, STA ID list = tags heard)  slots + Acks as above]
```

- Slot 1 starts one AMP SIFS after the end of the last symbol of the trigger PPDU (PDT 39.4, M#47). AMP SIFS = 10 µs
  (SFD PM-96: aSIFSTime 10 µs in 2.4 GHz).
- The AP sends an AMP Ack DL PPDU after every slot; slot k ≥ 2 starts one AMP SIFS after the end of Ack_{k−1}
  (SFD MM-46 / PDT 39.3.2.2). Ack PPDUs all have one duration and use the trigger's DL rate (PDT 39.3.2.2).
- Ack_k's ID field = the tag received in slot k, or the AP's identifier when nothing was received (PDT 39.3.2.2,
  which supersedes SFD FM-47's broadcast value).
- All slots have the same duration D, announced in the trigger (SFD FM-32). The AP sizes D for the UL PPDU it solicits
  at the UL rate: ID-only response (7 octets) or a response with the reading (15 octets).
- The trigger includes the padding field so a tag can answer one SIFS after it: 20 µs for an unprotected trigger,
  36 µs protected (PDT 39.3.2.2); only unprotected frames exist in this slice.
- Protection: with `ctsSelf`, a non-HT CTS-to-self (44 µs + 6 µs extension at 6 Mb/s) precedes the trigger and its
  Duration covers the whole round, so every Wi-Fi node on 2g sets its NAV. With `none`, Wi-Fi nodes defer only while a
  DL PPDU is on the air (its L-SIG length) or while a tag's OOK signal exceeds −62 dBm, so their frames land in the
  slots. Tags ignore both (no NAV).
- Result accounting at the AP: rounds, slots with a decoded response, slots with a failed reception (collision or weak),
  tags discovered, readings received.

### The tag (AmpStaMac)

- Listens always (no duty cycle in this slice). Wi-Fi frames are interference only.
- On decoding a random-access trigger: draws ABOC uniformly in [0, ACW] from its own seeded RNG stream, ACW = 2^ACWE − 1
  (PDT 39.4). If ABOC < N it will transmit in slot ABOC + 1; otherwise it sits the round out (records say which).
- Slot timing is Ack-keyed exactly as the draft has it: slot 1 is one AMP SIFS after the trigger; a tag due in slot k ≥ 2
  waits for the (k−1)th Ack and transmits one AMP SIFS after its end. A tag that fails to decode an Ack loses the round
  (this is why the draft keys slots to Acks: tag clocks are ±10 000 ppm, SFD PM-34).
- On a scheduled trigger whose STA list contains its id: its slot is its position in the list (PDT 39.3.2.1).
- After its slot it decodes the Ack; Ack ID = own id → acknowledged; otherwise the response is counted lost and the
  reading is offered again next round (the draft leaves ABOC on retransmission TBD; model: a fresh uniform draw).
- MAC states shown: `idle` (listening), `rx`, `ampWait` (armed for a slot), `tx`. New `MacStateName` value `ampWait`.

### AMP PHY airtime and decoding (`src/engine/amp.ts`)

DL AMP PPDU (Type 1, to Active Tx STAs, SFD PM-15/PM-40/PM-53/PM-71/PM-105/PM-106):

| Field | Duration | Source |
|---|---|---|
| L-STF, L-LTF, L-SIG, RL-SIG, U-SIG | 8 + 8 + 4 + 4 + 8 = 32 µs | SFD PM-15, 802.11be preamble |
| AMP-Sync: 32-chip sequence + 8-chip special segment at 2 µs chips | 80 µs | PM-40, PM-53, PM-71 |
| AMP-SIG: 2 octets, Manchester OOK at the DL rate | 64 µs @ 250 kb/s, 16 µs @ 1 Mb/s | PM-78, PM-105 |
| AMP-Data: frame octets × 8 / DL rate | | PM-9, PM-22 |
| Padding | 20 µs (36 µs protected) | PDT 39.3.2.2 |
| Signal extension | 6 µs | model, see Part A |

UL AMP PPDU (Active Tx, SFD PM-8, PM-51, PM-50, PM-93): AMP-Sync of 48 chips, then Manchester-OOK data.
Chip durations: 1 µs at 250 kb/s (BCC ½), 0.25 µs at 1 Mb/s (BCC ½), 0.125 µs at 4 Mb/s (uncoded), so the sync lasts
48 / 12 / 6 µs and the data lasts octets × 8 / rate. No legacy preamble, no signal extension.

AMP frame sizes (SFD FM-13…FM-21, FM-33, FM-49; field widths where the draft is TBD are **model**):

| Frame | Octets |
|---|---|
| MAC header: Frame Control 1, ID 2, Type Dependent Control 2 | 5 |
| AMP Trigger body: Session ID 1, ACWE/Number of Slots 1, Slot Duration 2, UL rate/seed/channel 1, Response type 1; scheduled: + 2 per STA ID | 6 (+2k) |
| FCS (16-bit CRC) | 2 |
| AMP Ack: Frame Control 1, ID 2, 8-bit CRC 1 | 4 |
| Tag response: header 5 + body (0 for ID-only, 8 for a reading) + FCS 2 | 7 or 15 |

Worked airtimes (pinned by tests): trigger 13 octets at 250 kb/s = 32 + 80 + 64 + 416 + 20 + 6 = 618 µs; at 1 Mb/s =
258 µs. Ack at 250 kb/s = 32 + 80 + 64 + 128 + 20 + 6 = 330 µs; at 1 Mb/s = 186 µs. Tag response at 250 kb/s: 272 µs
(ID-only), 528 µs (reading); at 1 Mb/s: 68 / 132 µs; at 4 Mb/s: 20 / 36 µs.

Decoding (model, documented as such):

- AP receiving a UL AMP PPDU: required SINR 10 dB at 250 kb/s (coded OOK), 12 dB at 1 Mb/s, 15 dB at 4 Mb/s; detection
  floor = noise floor in the OOK bandwidth (2 / 4 / 8 MHz, the existing noise formula) + required SINR: −94 / −89 /
  −83 dBm. No −82 dBm gate for these frames.
- Tag receiving a DL AMP PPDU: RSSI ≥ `dlSensDbm` (default −72 dBm) and SINR ≥ 8 dB.
- Wi-Fi radio receiving a DL AMP PPDU: it acquires the legacy preamble as usual (−82 dBm, 4 dB) and needs the L-SIG
  SINR (6 Mb/s threshold) to "decode" it, which sets CCA busy for the PPDU length and arms EIFS on failure. It cannot
  decode a UL AMP PPDU at all (no legacy preamble): energy detect only (−62 dBm).
- Capture window for AMP frames = their sync duration; the existing capture and collision machinery applies, so two tags
  in one slot collide unless one is 5 dB stronger within the sync.

`Channel.register` gains per-radio options: `floorDbm` (tags: their DL sensitivity), `cca: false` (tags emit no CCA
records). `FrameDesc` gains `amp?: { dir: 'dl' | 'ul'; kbps; slots?; slotNs?; acwe?; sessionId?; staIds?; slot?;
aboc?; phase?: 'random' | 'scheduled'; ackId? }`. New frame kinds: `ampTrigger`, `ampAck`, `ampResp`.

### Records and view state

New records:

- `AMP_ROUND { node: ap, phase, slots, slotNs, acwe, dlKbps, ulKbps, untilNs }` at the trigger's start.
- `AMP_SLOT { node: ap, slot, untilNs }` at each slot start (drawn as ticks on the AP lane).
- `AMP_ABOC { node: tag, aboc, acw, slot: number | null }` when a tag draws (null = sits out).
- `AMP_RESULT { node: tag, slot, acked: boolean }` when the tag reads the Ack for its slot, or fails to.
- `MAC_STATE` with `ampWait`.

`NodeView` gains `amp?: { aboc: number | null; acw: number; slot: number | null; sent: number; acked: number;
lost: number; roundsHeard: number; roundsSatOut: number }` for tags and `ampRound?: { phase; slot; slots; untilNs;
received: string[] }` for the AP. The view reducer applies the new records (snapshot/replay equivalence test covers
them).

### UI

- Lanes: tag lanes show rx (trigger/Ack), a `slot` span while armed (label "slot k"), tx (response). AP lane: slot
  ticks. Colours: AMP DL frames teal, tag responses violet (constants in the existing colour tables).
- Event log lines for the four new records; inspector rows (ABOC, ACW, slot, sent / acked / lost) for tags and the round
  summary for the AP.
- Frame detail: field-level decode of the three AMP frames (Frame Control with Type and Protected, ID, Type Dependent
  Control sub-fields, body fields, FCS) and the PPDU layout (preamble fields, AMP-Sync, AMP-SIG, AMP-Data, Padding,
  signal extension). Byte sums equal `frame.bytes`; segment sums equal `frame.txTimeNs` (existing test pattern).
- 3D scene: a tag is a small flat disc; AMP frames get their own wavefront colours.
- Editor: node kind **AMP tag** (place, drag, name, DL sensitivity, id); on an EHT AP an **AMP polling** section with
  the `AmpApCfg` fields; the spawn tool can add tags.
- i18n: every new string in both tables; glossary entries for AMP, AMP AP, Active Tx non-AP AMP STA, AMP Trigger,
  AMP Ack, ABOC, ACW, AMP SIFS, energizer (mentioned as future), backscatter (mentioned as future).
- Guide tab: a short AMP section (EN/ZH).

### Course

New module in Tier 2, inserted before "Real applications" so the tier still ends with its project:
**Ambient power IoT (802.11bp)** / 环境能量物联网（802.11bp）. `COURSE_ORDER` gains the three ids after `mlo`.

1. **`amp-intro` — A station that never contends.** Roles (AMP AP, Active Tx tag, AMP-enabled STA, energizer as a
   pointer), why a battery-free radio cannot run CSMA, the DL PPDU anatomy (legacy preamble so Wi-Fi defers, Sync, SIG,
   OOK data, padding), the trigger → slot → Ack sequence, AMP SIFS 10 µs. Scenario: one AP polling two tags every
   100 ms, no Wi-Fi traffic. Variant: 1 Mb/s DL/UL. Pinned: trigger and Ack airtimes, slot start = trigger end + 10 µs,
   slot 2 start = Ack₁ end + 10 µs, the round's total airtime and its share of the second.
2. **`amp-slots` — Slotted random access: ABOC, ACW and collisions.** Six tags, N = 4, ACWE = 2: sit-outs, collisions
   in a slot, the Ack that names the winner, retry next round. Variants ACWE 1 / 2 / 3 and `twoPhase`. The analytic
   model: with M tags, ACW and N slots, P(a tag transmits) = N/(ACW+1) and P(a given slot is a collision); measured over
   30 rounds against the formula (the module's small Bianchi). Pinned: per-round counts for the first rounds, the 30-round
   collision fraction within a stated tolerance of the formula.
3. **`amp-coexist` — AMP and Wi-Fi share 2.4 GHz.** The AP polls tags at AC_BK while a 2.4 GHz camera uploads at AC_BE
   and a phone streams video down. Variants: `ctsSelf` vs `none`. Pinned: with `none`, camera frames start inside the
   slots and tag responses fail (counts); with `ctsSelf`, the camera sets NAV for the round (NAV_SET from cts) and the
   round costs the stated µs per second of camera airtime; the AP's BK contention waits behind the camera's BE (AIFSN 7
   vs 3) by the stated margin.

Every empirical claim is pinned by `tests/course/amp-*.test.ts`. The lesson contract (EN + ZH, concept → scenario →
observe → try this → quiz, 15–25 minutes) applies unchanged.

## Testing

- `tests/engine/link-2g.test.ts`: ERP timing constants, DIFS 28 / AckTimeout 39 / EIFS 88 µs in a 2g exchange, 6 µs
  extension in every 2g PPDU, −6.5 dB path-loss offset, MLO plan untouched, and the timeline hash of every existing
  lesson scenario unchanged.
- `tests/engine/amp-phy.test.ts`: every airtime and sensitivity in the tables above.
- `tests/engine/amp-sta.test.ts`: ABOC range and determinism, sit-out when ABOC ≥ N, slot 1 at trigger end + 10 µs,
  slot k at Ack end + 10 µs, a lost Ack loses the round, an unacknowledged response is retried next round, scheduled
  slot from list position, Wi-Fi frames never trigger a tag.
- `tests/engine/amp-ap.test.ts`: round structure and Ack IDs, AC_BK contention (AIFSN 7), CTS-to-self Duration equals
  the rest of the round and Wi-Fi nodes set NAV from it, `none` lets a BE station start inside a slot, `twoPhase` sends
  the scheduled trigger listing exactly the tags heard, rounds repeat at the poll interval.
- `tests/engine/amp-collision.test.ts`: two tags in one slot collide (RX_FAIL collision + COLLISION), a 5 dB stronger
  tag captures, a tag below −94 dBm is not decoded at 250 kb/s, a tag beyond its DL sensitivity never answers.
- View: snapshot/replay equivalence with AMP records; `frameFields` sums for the three AMP frames.
- Course: the three claim files; the existing lesson-structure tests updated for the new module index.

## Out of scope (next AMP slices, in order)

1. Mono-static backscatter in 2.4 GHz: excitation fields, 16 µs immediate response, RFID Select/Read, UL inside the
   excitation, the AP's self-interference budget.
2. Energy: harvesting and storage state on tags, the sustain-time report, service periods and duty cycle.
3. Bistatic backscatter with an energizer, the 40 MHz protection sequence, group Ack.
4. Sub-1 GHz channelization and WPT.
