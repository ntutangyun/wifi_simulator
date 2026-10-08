/**
 * Shared Wi-Fi scene builders for tier 1 and tier 2 lessons: the three floor
 * plans (`oneRoom`, `hallwayHouse`, `longApartment`), the scenario helper
 * `sc`, and the width / MU-MIMO / rate scenario builders several lessons
 * share. `sc`, `oneRoom`, `hallwayHouse` and `longApartment` are re-exported
 * from `./lessonKit` so existing imports of them keep working unchanged.
 *
 * Since 2026-10-05 it also holds the two builders of the built-but-untaught slice —
 * `cloudGameScenario` (the first scene in this course with an application layer above the MAC)
 * and `tamperScenario` (the first with a station that does not obey the EDCA parameters). Both
 * write their own `servers` list in their own `extra`; `sc()`'s empty default is never touched,
 * and the comment on it says why that is a prohibition rather than a fact.
 */
import type { FadingCfg } from '../engine/fading'
import { noiseDbm } from '../engine/phy'
import type { ChannelWidth, Nss } from '../model/caps'
import type { NodeCfg, Room, Scenario, ServerCfg, TamperKind, Wall } from '../model/scenario'
import { DEFAULT_SERVERS, TAMPER_PRESETS } from '../model/scenario'
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
    // `sc()`'s default is NO cloud server, and every lesson written before 2026-10-05 relies on
    // it: `tests/course/quoted-timestamps.test.ts` pins timestamps to the nanosecond, and a
    // `servers` entry delays every downlink frame by one WAN crossing, which moves the whole
    // timeline. Measured, by retrofitting DEFAULT_SERVERS onto scenes this course already
    // ships (300 ms, seed 7): `edca` goes from 29 579 records / 2 176 RX_OK to 29 495 / 2 161,
    // and `nav` from 51 920 / 4 620 to 52 063 / 4 626. A scene that wants servers states them
    // in its own `extra` and is a NEW scene — never retrofit `servers` onto a shipped one.
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

/**
 * The overseas game server of `cloudGameScenario`'s third variant: the same endpoint with a
 * round trip of 80 ms and 20 ms of jitter instead of 25 and 3.
 *
 * Both figures are `model` and this slice did not pick them — they are the pair
 * `docs/superpowers/specs/2026-09-08-cloud-servers-households-design.md` chose for a server on
 * another continent, and `engine/traffic.ts`'s own note records the one measurement that bears
 * on them (a Tencent server at a median 49 ms, which sits between the two presets, so neither
 * moved). `processMs` is the domestic preset's, unchanged: a server does not compute faster for
 * being nearer.
 */
const OVERSEAS_GAME_SERVER: ServerCfg = { ...gameServer(), rttMs: 80, jitterMs: 20 }

/** The default game endpoint, read off `DEFAULT_SERVERS` rather than re-typed. */
function gameServer(): ServerCfg {
  const s = DEFAULT_SERVERS.find((x) => x.kind === 'game')
  if (!s) throw new Error('DEFAULT_SERVERS has no game server')
  return { ...s }
}

/**
 * A phone playing against a cloud game server, in the room the Wi-Fi lessons have used all
 * along: the `wan-rtt` lesson's own scene, and the first scene in this course with an
 * application layer above the MAC.
 *
 * **The base scene is QUIET — one phone, one server, nobody else — and that is the lesson's
 * first number rather than a thin start.** Measured at 5000 ms, seed 7: the phone's
 * application round trip averages 28.688 ms while its MAC queue-to-ack latency averages
 * 0.106 ms, the same 0.106 on all 210 frames. The air is four thousandths of what the player
 * waits. A scene with competition in it cannot make that point, because there the two numbers
 * are the same order of magnitude.
 *
 * **One game server and not `DEFAULT_SERVERS`, deliberately.** The other three default
 * endpoints — video, web, call — are reached through `serverKindFor`, and no profile in this
 * scene asks for any of them, so adding them is byte-identical to leaving them out (measured:
 * same hash at 2000 ms, quiet and busy alike). Shipping three entries that provably do nothing
 * is how a scene comes to look richer than it is; `tests/engine/tamper-inert.test.ts` asserts
 * the inertness instead.
 *
 * The four options are the four variants, and each one is a single axis off the base:
 *
 *  - `busy` — two saturated laptops at the other end of the room. This is where the air first
 *    appears: 0.106 ms of queueing becomes 10.717 ms and the round trip 44.483 ms.
 *  - `accel` — the router's game mode, which is one boolean on the AP (`NodeCfg.gameAccel`) and
 *    moves the game flow from AC_BE to AC_VI. It is only ever set WITH `busy`, because in the
 *    quiet room it changes no outcome at all: `RX_OK` is 254 either way and only the backoff
 *    draws differ (`tests/engine/tamper-inert.test.ts`).
 *  - `overseas` — the 80/20/2 endpoint, quiet, so the difference is the WAN and nothing else.
 *  - `noServers` — the same room with `sc()`'s own default, where `stats.appRtt.n` is 0 and the
 *    engine has no way to answer "how long did the player wait".
 *
 * `cheat` is the one option that is not about the WAN: it hangs a tamper preset on the phone, so
 * that `edca-tamper` can load this exact scene for the one cheat that does nothing in it
 * (§7.2 of the design doc — `txopHog` rewrites 87 `TXOP_START.untilNs` fields and not one
 * consequence).
 */
export function cloudGameScenario(opts: {
  /** Two saturated laptops beside the phone: the only configuration where the air shows. */
  busy?: boolean
  /** The router's game mode, which marks game traffic into AC_VI. Needs `busy` to show. */
  accel?: boolean
  /** The 80 ms / 20 ms endpoint instead of the 25 ms / 3 ms one. */
  overseas?: boolean
  /** No cloud server at all: the same room, `sc()`'s default, and no application number. */
  noServers?: boolean
  /** A tamper preset on the phone, for `edca-tamper`'s inert-cheat variant. */
  cheat?: TamperKind
} = {}): Scenario {
  const feats = { edca: true, txop: true, ampdu: true }
  const ap = node('ap', 'Router', 'ap', 5, 1, 'eht', 'idle', feats)
  if (opts.accel) ap.gameAccel = true
  const phone = node('sta-1', 'Phone (gaming)', 'sta', 3, 5, 'eht', 'gaming', feats)
  if (opts.cheat) phone.tamper = TAMPER_PRESETS[opts.cheat]
  const nodes = [ap, phone]
  if (opts.busy) {
    nodes.push(node('sta-2', 'Laptop A (upload)', 'sta', 8, 6, 'eht', 'saturated', feats))
    nodes.push(node('sta-3', 'Laptop B (upload)', 'sta', 9, 3, 'eht', 'saturated', feats))
  }
  const servers = opts.noServers ? [] : [opts.overseas ? OVERSEAS_GAME_SERVER : gameServer()]
  return sc(oneRoom(), nodes, { servers })
}

/**
 * Three saturated stations in one room, the first of them optionally running a tampered driver:
 * the `edca-tamper` lesson's own scene.
 *
 * **Saturated and not gaming, and that is a measurement rather than a mood.** A cheat needs a
 * queue to cheat with: in a room where the only station plays a game, `txopHog` changes nothing
 * but the number it announces, because a game's uplink is 89–131 bytes about every 30 ms and
 * there is never a second frame to hold the medium for. Three saturated stations always have a
 * second frame, so all seven presets have something to take.
 *
 * **No `servers`, and that one is measured too.** `serverKindFor('saturated')` is `null`, so a
 * server list here is reached by nobody: the same scene with `DEFAULT_SERVERS` replays to the
 * same 185 113 records and the same hash at 2000 ms. The design document asked for
 * `servers = DEFAULT_SERVERS` on this scene; it would have been a legal setting that provably
 * does nothing, which is the shape this repository keeps shipping by accident, so it is left
 * out and the inertness is asserted instead (`tests/engine/tamper-inert.test.ts`).
 *
 * `hidden` swaps the one room for `hallwayHouse` and two stations that cannot hear each other —
 * the geometry in which `navInflate` works through the access point's CTS rather than through
 * its own frames, which is the one claim of this lesson that the one-room scene cannot show.
 * `seed` is for the tests: the four-rung ladder is a cross-seed claim and has to be checked
 * across seeds, while the lesson's own scene stays on seed 7 like every other lesson's.
 */
export function tamperScenario(cheat?: TamperKind, opts: { seed?: number; hidden?: boolean } = {}): Scenario {
  const feats = { edca: true, txop: true, ampdu: true }
  const extra = opts.seed === undefined ? {} : { seed: opts.seed }
  if (opts.hidden) {
    const ap = node('ap', 'Router', 'ap', 5, 4, 'eht', 'idle', feats)
    const a = node('sta-1', 'Station A', 'sta', 2, 4, 'eht', 'saturated', feats)
    const b = node('sta-2', 'Station B', 'sta', 8, 4, 'eht', 'saturated', feats)
    if (cheat) a.tamper = TAMPER_PRESETS[cheat]
    return sc(hallwayHouse(), [ap, a, b], extra)
  }
  const ap = node('ap', 'Router', 'ap', 5, 1, 'eht', 'idle', feats)
  const stas = [3, 5, 7].map((x, i) => node(`sta-${i + 1}`, `Station ${i + 1}`, 'sta', x, 5, 'eht', 'saturated', feats))
  if (cheat) stas[0].tamper = TAMPER_PRESETS[cheat]
  return sc(oneRoom(), [ap, ...stas], extra)
}

/**
 * Two bedrooms either side of a brick stairwell that holds the router: the
 * `link-2g` lesson's own floor plan, and it exists for one measured reason.
 *
 * **The geometry was chosen to put ONE ray on one side of ONE threshold.** The
 * stations stand 8.5 m apart with two brick walls between them, and
 * `buildLinkTable` gives that path −83.58 dBm — 1.58 dB under the −82 dBm
 * preamble-detection threshold of `engine/phy.ts`'s `CCA_PD_DBM`. Move the same
 * pair onto 2.4 GHz and `LINK_EXTRA_LOSS_DB` adds 6.5 dB of signal: −77.08 dBm,
 * 4.92 dB over. Each station reaches the router through one wall at −64.14 dBm
 * either way, so the only link the band change moves across a threshold is the
 * station-to-station one.
 *
 * It is NOT `hallwayHouse()`, and the difference is deliberate rather than
 * decorative: that plan's 2 m hallway lands the same path at −82.79 dBm, 0.79 dB
 * under the threshold, and a lesson whose whole subject is a knife edge should
 * own the knife rather than borrow one that happens to be sharp. The 2.5 m
 * stairwell is the width at which the margin is reportable to two figures
 * without being a coincidence of rounding.
 *
 * The router sits in the middle of the stairwell (y = 4) rather than against a
 * wall, so neither station is nearer to it than the other: the two
 * station-to-router figures are equal to the last digit, and every difference
 * the lesson prints is therefore the band and not the floor plan.
 */
export function stairHouse(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [
      { x: 0, y: 0, w: 4, h: 8, name: '卧室 A' },
      { x: 4, y: 0, w: 2.5, h: 8, name: '楼梯间' },
      { x: 6.5, y: 0, w: 4, h: 8, name: '卧室 B' },
    ],
    walls: [
      brick(0, 0, 10.5, 0), brick(10.5, 0, 10.5, 8), brick(10.5, 8, 0, 8), brick(0, 8, 0, 0),
      brick(4, 0, 4, 8), brick(6.5, 0, 6.5, 8),
    ],
  }
}

/**
 * The `link-2g` scenes: the same room and the same radios on one band or the
 * other, in three shapes.
 *
 * `band` is written onto the access point AND onto every station, which is the
 * one thing a caller must not get wrong here: `linkPlanFor` gives the access
 * point every link one of its stations uses, so pinning only the stations
 * builds a two-link cell and the comparison stops being a comparison.
 *
 * EDCA is off in every shape, and that is what makes the timing readable rather
 * than a preference: with EDCA on, an `IFS_START` record carries `kind: 'AIFS'`
 * and the AC's own AIFSN, so the DIFS the lesson is about never appears in the
 * timeline at all (`aifsNs`, `engine/phy.ts`). The 2.4 GHz AIFS figures a
 * reader may want are already printed by `@amp-coexist`.
 *
 *  - `shape: 'pair'` — the stairwell plan, two saturated stations that can or
 *    cannot hear each other depending on the band. Aggregation off, so one
 *    exchange is one frame and one acknowledgement.
 *  - `shape: 'single'` — one room, one saturated station on the desk at
 *    −46.7 dBm, where both bands reach the top of the Wi-Fi 6 ladder and the
 *    only thing left that can differ is the interframe timing.
 *  - `shape: 'burst'` — the same desk with aggregation on, so one exchange is
 *    one A-MPDU and one BlockAck. It exists because the signal extension is
 *    charged per PPDU and not per MPDU: twenty MSDUs in one PPDU pay it once,
 *    which is what makes the four-figure net sum zero for a second reason
 *    rather than by luck (`tests/course/link-2g.test.ts`).
 *  - `shape: 'wide'` — the same desk, both radios Wi-Fi 7 asking for 160 MHz.
 *    `widthOf` grants it on 5 GHz and caps it at 40 MHz on 2.4 GHz, which is
 *    the one place in this lesson where 2.4 GHz is simply worse.
 */
export function link2gScenario(
  shape: 'pair' | 'single' | 'burst' | 'wide', band: '2g' | '5g', opts: { seed?: number } = {},
): Scenario {
  const extra = opts.seed === undefined ? {} : { seed: opts.seed }
  const pin = (n: NodeCfg): NodeCfg => (band === '2g' ? { ...n, linkId: '2g' } : n)
  if (shape === 'pair') {
    const feats = { edca: false }
    const ap = node('ap', 'Router', 'ap', 5.25, 4, 'he', 'idle', feats)
    const a = node('sta-1', 'Laptop A', 'sta', 1, 2, 'he', 'saturated', feats)
    const b = node('sta-2', 'Laptop B', 'sta', 9.5, 2, 'he', 'saturated', feats)
    return sc(stairHouse(), [ap, a, b].map(pin), extra)
  }
  const wide = shape === 'wide'
  const feats: Record<string, boolean> = wide
    ? { edca: false, qam4k: true }
    : { edca: false, ampdu: shape === 'burst' }
  const gen = wide ? 'eht' : 'he'
  const ap = node('ap', 'Router', 'ap', 3, 4, gen, 'idle', feats)
  const sta = node('sta-1', 'Laptop', 'sta', 6, 4, gen, 'saturated', feats)
  if (wide) { ap.caps.widthMhz = 160; sta.caps.widthMhz = 160 }
  return sc(oneRoom(), [ap, sta].map(pin), extra)
}
