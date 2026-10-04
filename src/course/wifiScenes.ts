/**
 * Shared Wi-Fi scene builders for tier 1 and tier 2 lessons: the three floor
 * plans (`oneRoom`, `hallwayHouse`, `longApartment`), the scenario helper
 * `sc`, and the width / MU-MIMO / rate scenario builders several lessons
 * share. `sc`, `oneRoom`, `hallwayHouse` and `longApartment` are re-exported
 * from `./lessonKit` so existing imports of them keep working unchanged.
 */
import type { FadingCfg } from '../engine/fading'
import { noiseDbm } from '../engine/phy'
import type { ChannelWidth, Nss } from '../model/caps'
import type { NodeCfg, Room, Scenario, Wall } from '../model/scenario'
import { brick, node } from './lessonKit'

/** Single 10×8 room with a brick shell. */
export function oneRoom(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }],
    walls: [brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0)],
  }
}

/**
 * Room A | brick hallway (AP) | Room B. The stations' ray crosses TWO brick
 * walls (~24 dB) at ~8.4 m, landing below the −82 dBm preamble threshold —
 * genuinely hidden — while each station reaches the AP through one wall.
 */
export function hallwayHouse(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [
      { x: 0, y: 0, w: 4, h: 8, name: 'Room A' },
      { x: 4, y: 0, w: 2, h: 8, name: 'Hallway' },
      { x: 6, y: 0, w: 4, h: 8, name: 'Room B' },
    ],
    walls: [
      brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0),
      brick(4, 0, 4, 8), brick(6, 0, 6, 8),
    ],
  }
}

/**
 * Long 16×8 apartment: a study (0–6) and a far living room (6–16) split by
 * brick. Wide enough that the far station is genuinely far — ~11.5 m plus one
 * wall lands it at ~−75 dBm (12 Mb/s), 40 dB under the near station, so the
 * near frame's capture clears its 30 dB decode threshold by ~10 dB instead of
 * sitting on the edge of it.
 */
export function longApartment(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [
      { x: 0, y: 0, w: 6, h: 8, name: 'Study' },
      { x: 6, y: 0, w: 10, h: 8, name: 'Living room' },
    ],
    walls: [
      brick(0, 0, 16, 0), brick(16, 0, 16, 8), brick(16, 8, 0, 8), brick(0, 8, 0, 0),
      brick(6, 0, 6, 8),
    ],
  }
}

export function sc(house: { rooms: Room[]; walls: Wall[] }, nodes: NodeCfg[], extra: Partial<Scenario> = {}): Scenario {
  return {
    ...house, nodes,
    // Lessons are about the Wi-Fi MAC: no cloud servers, so no WAN delay and
    // every quoted timestamp stays where it is.
    servers: [],
    seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    ...extra,
  }
}

/**
 * A router and one laptop on the same desk in the study of a long flat, both
 * at a chosen channel width and stream count. Module 4 is about what one frame
 * costs, so aggregation is off: every data frame is a single 1500-byte MSDU,
 * 1530 octets on the air. MLO is off too, so the pair keeps one 5 GHz lane.
 * The far living room is there for the experiments: it is the only part of the
 * flat where a wide channel runs out of signal.
 */
export function widthScenario(widthMhz: ChannelWidth, nss: Nss, apNss: Nss = nss): Scenario {
  const feats = { edca: true, qam4k: true }
  const ap = node('ap', 'Router', 'ap', 3, 4, 'eht', 'idle', feats)
  const sta = node('sta-1', 'Laptop', 'sta', 4, 4, 'eht', 'saturated', feats)
  ap.caps.widthMhz = widthMhz
  ap.caps.nss = apNss
  sta.caps.widthMhz = widthMhz
  sta.caps.nss = nss
  return sc(longApartment(), [ap, sta])
}

/**
 * The `width` scene again, at one of the FIVE widths, with the fast fade on and the channel
 * split into 26-tone-RU bins: the `selectivity` lesson's own scene.
 *
 * Three departures from `widthScenario`, and each one is the lesson's subject rather than a
 * decoration:
 *
 *  - **the two sections the schema requires together.** `fading` with `smallScale: 'rayleigh'`
 *    and `selectivity: {}`. Without both, `ScenarioSchema`'s `superRefine` refuses the plan —
 *    a `selectivity` section over a flat channel draws the same deviation in every bin, which
 *    is byte-identical to leaving it off. `shadowSigmaDb: 0` leaves the slow layer out: a
 *    shadow is the whole channel together (engine/fading.ts), so it would move all five widths
 *    by one common offset and only blur the layer this lesson re-keys per bin.
 *  - **the station stands in the far living room**, where `width`'s own `tryThis` sends it. On
 *    the study desk this link has more margin than any per-bin loss this feature produces, and
 *    every width drops zero frames (tests/engine/selectivity-inert.test.ts measures exactly
 *    that, as the feature's "legal and nothing follows" case).
 *  - **both radios are turned up by the noise floor's own rise**, `noiseDbm(w) − noiseDbm(20)`,
 *    computed from the engine's formula and never written down. That rise — 12.04 dB from 20 to
 *    320 MHz — is the real cost of a wide channel and the thing `width` already teaches; left
 *    in, it swamps the effect under test, and the five widths' drop rates would not be
 *    comparable at all. This is the same construction the measurements the lesson quotes were
 *    taken on (tests/engine/selectivity-round.test.ts and -inert.test.ts).
 *
 * 320 MHz is in the variant list although `width`'s four stop at 160: every figure this lesson
 * prints runs to 320 MHz / 144 bins, and a number a reader cannot reach in the scene is a
 * number they have to take on trust.
 */
export function selectivityScenario(widthMhz: ChannelWidth): Scenario {
  const base = widthScenario(widthMhz, 1)
  const liftDb = noiseDbm(widthMhz) - noiseDbm(20)
  return {
    ...base,
    nodes: base.nodes.map((n) => ({
      ...n,
      txPowerDbm: n.txPowerDbm + liftDb,
      ...(n.id === 'sta-1' ? { pos: { ...n.pos, x: 12.5, y: 6 } } : {}),
    })),
    fading: { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' },
    selectivity: {},
  }
}

/**
 * The `width` scene's geometry with the laptop in the far living room and **one link in the
 * whole flat**: the `fading` lesson's own scene. `f` is the `fading` section, and **omitting it
 * writes no `fading` key at all** rather than writing a section that fades by zero — the engine
 * reads an absent section as "do not enter the fading branch", which is what keeps the
 * unfaded run bit-identical to every other lesson on this geometry.
 *
 * Three departures from `widthScenario(20, 1)`, and each one is a measurement rather than taste:
 *
 *  - **one link, and no second device.** This is the only shape the lesson's claim survives in.
 *    Measured on `rateScenario`, the two-station scene the rate lessons use (3000 ms, seed 7):
 *    turning `FADING_DEFAULTS` on there takes `COLLISION` from **0 to 514** and the near
 *    station's `ACK_TIMEOUT` from **0 to 623**, because the fade pushes the near-to-far link
 *    below the carrier-sense threshold and conjures a whole class of hidden-node collisions out
 *    of nothing. That is real physics and it is **a different lesson** (design §5.3); here it is
 *    a confound that would drown the half this lesson is about. In this scene `COLLISION` is
 *    **0 under every configuration** (measured, 5 seeds x 6 configurations), so every failure
 *    it shows can only have come from the link itself.
 *  - **the station stands at x = 12.5, y = 6**, which is where `selectivityScenario` puts it and
 *    where `width`'s own `tryThis` sends it. On the study desk the margin swallows anything
 *    either layer produces (design §7, case 4).
 *  - **20 MHz and no power lift.** `selectivityScenario` raises both radios by
 *    `noiseDbm(w) − noiseDbm(20)` to hold the mean SINR across its five widths; with one width
 *    that lift is exactly 0 dB, so it is not written.
 *
 * **The geometry is identical to `selectivityScenario(20)` without its `selectivity` section,
 * and that is verified rather than inferred**: at 1000 ms and seed 7 the two agree hash for hash
 * in all four configurations — `310a660` unfaded, `bb43aa57` shadowed, `eddfc731` Rayleigh,
 * `63a71c47` Rician — so the margin already measured on this link by the `selectivity` and
 * `ru-diversity` slices can be quoted here instead of a second ruler being built
 * (`tests/course/fading.test.ts` pins the identity).
 */
export function fadingScenario(f?: FadingCfg): Scenario {
  const base = widthScenario(20, 1)
  return {
    ...base,
    nodes: base.nodes.map((n) => (n.id === 'sta-1' ? { ...n, pos: { ...n.pos, x: 12.5, y: 6 } } : n)),
    ...(f === undefined ? {} : { fading: f }),
  }
}

/**
 * A three-room flat whose far room is **two** brick walls from the router: the
 * `ru-diversity` lesson's own floor plan.
 *
 * `longApartment` puts its far living room behind one brick wall; this plan adds a
 * second at x = 11 and puts the two televisions beyond it. The extra wall is the
 * whole reason the plan exists, and it is 12 dB of it (`propagation.ts`'s material
 * table): see `ruDiversityScenario` for what those 12 dB are for.
 */
function twoWallFlat(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [
      { x: 0, y: 0, w: 6, h: 8, name: 'Study' },
      { x: 6, y: 0, w: 5, h: 8, name: 'Living room' },
      { x: 11, y: 0, w: 5, h: 8, name: 'Bedroom' },
    ],
    walls: [
      brick(0, 0, 16, 0), brick(16, 0, 16, 8), brick(16, 8, 0, 8), brick(0, 8, 0, 0),
      brick(6, 0, 6, 8), brick(11, 0, 11, 8),
    ],
  }
}

/**
 * A router and **two** televisions on one 20 MHz channel, with the fast fade on and the
 * channel split into 26-tone-RU bins: the `ru-diversity` lesson's own scene, where a
 * downlink multi-user PPDU carries two members and each one reads **4 of the 9 bins** it
 * used to be credited with.
 *
 * Every published multi-user scene was measured and none of them can carry this lesson
 * (design doc 2026-10-04 §7.3): the two `ofdma` scenes have 12 to 15 dB of margin, where a
 * four-bin loss changes no outcome at all, and `mumimo(on)`'s margin is bimodal, where most
 * of the drops have nothing to do with the bin count. The one scene the effect was clean on
 * — `selectivity(20)` — has a single station, so the engine never splits anything in it.
 *
 * So this scene is `selectivityScenario`'s construction with a second member added, and
 * four of its five departures from that construction are measurements rather than taste:
 *
 *  - **the two sections the schema requires together**, unchanged: Rayleigh with
 *    `shadowSigmaDb: 0` and `selectivity: {}`. The shadow is left out for the same reason
 *    as there — it is one offset on the whole channel — and here it does a second job: the
 *    shadow is what made `mumimo(on)`'s margin bimodal, and the acceptance gate for this
 *    lesson is stated *inside one measured margin group*.
 *  - **the televisions sit two brick walls away, not one.** This is the scene's only tuned
 *    quantity and it is tuned to the margin, which is what the lesson is read at. Measured on
 *    this plan, seed 7, 1000 ms: the member's `meanSinrDb − threshDb` is **3.547 dB** on all
 *    292 downlink data receptions the two televisions were addressed in — **one group, so the
 *    bimodality design §7.3 warned about is absent here rather than handled**. The 12 dB of
 *    the second wall is the engine's own material constant (`propagation.ts`), never a number
 *    chosen here.
 *
 *    **How little room that leaves, which the comment used to omit.** The passing window is
 *    roughly a margin of 3 to 15 dB (design §7.3.1 (b): below about 2.5 dB the chain is no
 *    longer monotone, and above about 15 dB every leg is zero). Moving the pair inside this
 *    room walks the margin one MCS rung at a time — x = 11.5 / 12.5 / **13.5** / 14.5 gives
 *    **6.240 / 4.826 / 3.547 / 2.381 dB** — so the shipped point has about 1 dB, or one metre,
 *    before the band's lower edge. The three nearer positions all pass the gate (6.76 % against
 *    1.49 % at x = 11.5, 18.44 % against 6.56 % at x = 12.5); x = 14.5 is already inside the
 *    non-monotone region. **Instrument for every figure in this paragraph and the two below**,
 *    unless one says otherwise: this builder with both televisions' x moved together, seed 7,
 *    1000 ms, addressed downlink receptions only, grouped by raw float margin, largest group —
 *    the gate's own rule (`tests/course/ru-diversity.test.ts` pins all of them).
 *    **Further from the router is where this scene breaks, and it breaks quietly.**
 *
 *    **The two alternatives, and what is actually wrong with each.**
 *    *One wall instead of two* does not give one number, and this is where the comment was
 *    wrong twice over: leaving the televisions where they are and deleting the x = 11 partition
 *    gives a median margin of **15.547 dB** (628 of 666 addressed downlink receptions sit on
 *    that one rung — grouped by the MCS decode threshold, which is what "rung" means here; the
 *    same rows grouped by exact float margin give 588, so the grouping has to be stated) — the
 *    useless margin `ofdma-dl` already has; whereas one wall *with the televisions moved into
 *    the living room at x = 8.5* gives **5.672 dB at the median over four rungs, MCS 4 to 7**
 *    (1000 ms, seed 7, both measured on this builder). Both are real and they are two
 *    different scenes, so the one-variable control is the first. The second is not a control
 *    at all: its margin is multi-valued, which is the confound again.
 *    *Turning the router down* reaches the same rung at **12 dB**, not 13 — the brick's own
 *    loss, since −11 / −12 / −13 dB on the one-wall plan give 4.547 / 3.547 / 2.547 dB. It is
 *    still not the same scene, and not merely a worse story: the power knob only moves the
 *    downlink, so the televisions' own frames keep the 12 dB the wall would have taken, and the
 *    round differs — **291 member receptions at 26.12 % here against 283 at 30.04 % there**,
 *    both counted the same way. (This pair used to read 「284 at 29.93 %」, which was that
 *    round's 283 members *plus* its one whole-channel reception, divided into the members' own
 *    85 failures: true of neither population, and not the instrument the figure beside it uses.)
 *    **And 13 dB — the figure this comment used to print — lands on 2.547 dB, inside the
 *    non-monotone region, where the gate is not even stably signed**: that configuration passes
 *    at 1000 ms (41.94 % against 39.45 %) and **fails at 2000 ms (38.58 % against 39.91 %)**.
 *    A reader who followed the old sentence would have built the one scene that disproves it.
 *  - **no saturating load, and that is a correction.** `mumimoScenario`'s comment above
 *    explains that two video streams in one room never group, because the router drains
 *    each packet before the next one lands — true there, and **false here**: at this range
 *    the link settles at MCS 0, one video packet takes long enough that the next one is
 *    already queued for the other television, and **346 of this scene's 347 downlink data
 *    PPDUs carry both members** (1000 ms, seed 7). The far link is its own saturating load,
 *    so the fourth device that scene needs is not here — which also removes the question of
 *    whether the load would join the group and make the share 1/3 instead of 1/2.
 *  - **MU-MIMO capability is absent, not merely unused.** This slice only changes the OFDMA
 *    path: a MU-MIMO member spans the whole channel and carries no share at all
 *    (`mac.ts`'s `frac = mumimo ? 1 : 1 / dsts.length`), so a scene that could choose it
 *    would sometimes measure nothing. Absent from `features`, it cannot be negotiated.
 *  - **20 MHz, and no power lift.** `selectivityScenario` lifts both radios by
 *    `noiseDbm(w) − noiseDbm(20)` to hold the mean SINR across its five widths; this scene
 *    has one width, so that lift is exactly 0 dB and is not written. 20 MHz is also the only
 *    width where the standard's own tone table makes the truncation visible — two 106-tone
 *    resource units cover 4 bins each and leave the middle one to nobody (design §2.3).
 *
 * `ofdmaOn` is the lesson's counterfactual and the acceptance gate's own control: with the
 * capability off the two televisions are served one at a time and each reception reads all
 * 9 bins, on the same link, at the same measured margin, so the two runs differ by the share
 * and by nothing else. `ofdma-dl`'s `tryThis` already asks a reader to flip exactly this.
 */
export function ruDiversityScenario(ofdmaOn = true): Scenario {
  const feats = { edca: true, ampdu: true, txop: true, ofdma: ofdmaOn }
  const ap = node('ap', 'Router', 'ap', 3, 4, 'eht', 'idle', feats)
  // Both televisions are the same distance from the router (10.5475 m, and the same two
  // walls), so they share one mean SINR and therefore one margin — which is what lets the
  // gate compare member receptions against whole-channel ones without a second group.
  const tv1 = node('sta-1', 'TV 1', 'sta', 13.5, 5, 'eht', 'video', feats)
  const tv2 = node('sta-2', 'TV 2', 'sta', 13.5, 3, 'eht', 'video', feats)
  for (const n of [ap, tv1, tv2]) {
    n.caps.widthMhz = 20
    n.caps.nss = 1
  }
  return {
    ...sc(twoWallFlat(), [ap, tv1, tv2]),
    fading: { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' },
    selectivity: {},
  }
}

/**
 * A four-stream router and three two-stream phones, each pulling its own
 * video stream, in one room. A fourth device — a laptop backing up files flat
 * out — keeps the channel busy: without it the router drains each phone's
 * video packet long before the next one lands, and a queue that never holds
 * more than one destination at a time never gives the AP a second station to
 * group. `mumimoOn` toggles only the phones' and router's MU-MIMO capability;
 * OFDMA stays negotiated throughout, because it is OFDMA capability, not
 * MU-MIMO capability, that lets the AP consider more than one destination at
 * once at all — MU-MIMO only chooses itself over OFDMA once that door is open.
 */
export function mumimoScenario(mumimoOn: boolean): Scenario {
  const feats = { edca: true, ampdu: true, txop: true, ofdma: true, qam4k: true, mumimo: mumimoOn }
  const ap = node('ap', 'Router', 'ap', 5, 4, 'eht', 'idle', feats)
  const sta1 = node('sta-1', 'Phone 1', 'sta', 4, 3, 'eht', 'video', feats)
  const sta2 = node('sta-2', 'Phone 2', 'sta', 6, 3, 'eht', 'video', feats)
  const sta3 = node('sta-3', 'Phone 3', 'sta', 5, 5.5, 'eht', 'video', feats)
  const backup = node('sta-4', 'Laptop (backup)', 'sta', 2, 6.5, 'eht', 'saturated', feats)
  ap.caps.widthMhz = 160
  ap.caps.nss = 4
  for (const s of [sta1, sta2, sta3]) {
    s.caps.widthMhz = 160
    s.caps.nss = 2
  }
  backup.caps.widthMhz = 160
  backup.caps.nss = 1
  return sc(oneRoom(), [ap, sta1, sta2, sta3, backup])
}
/**
 * Two saturated uploaders on one AP: one on the desk beside it, one in the
 * far corner of the flat behind a brick wall. Aggregation and TXOP are off,
 * so every exchange is exactly one MSDU — clean, one-for-one accounting of
 * failures against the far station's working MCS.
 */
export function rateScenario(): Scenario {
  const feats = { edca: true }
  const ap = node('ap', 'AP', 'ap', 4, 4, 'eht', 'idle', feats)
  const near = node('sta-1', 'Near uploader', 'sta', 4.8, 4.3, 'eht', 'saturated', feats)
  const far = node('sta-2', 'Far uploader', 'sta', 15, 7, 'eht', 'saturated', feats)
  return sc(longApartment(), [ap, near, far])
}
