# Module 4 · How fast is fast — channel width, streams, MU-MIMO, rate adaptation

Date: 2026-09-10
Status: design approved, ready for an implementation plan

## Problem

The PHY is 20 MHz wide and one spatial stream everywhere. A commercial
Wi-Fi 7 access point runs 160 MHz with four streams and phones do two
streams, so the data symbols of every frame in the simulator occupy eight
to seventeen times more airtime than on real hardware. The preamble is
fixed, so the effect on a whole frame depends on its size: a single 1500 B
frame shrinks about threefold, a twenty-subframe aggregate about
thirteenfold. That difference is itself worth teaching, because it is why
aggregation and multi-user transmission exist at these rates. The device presets
already carry the truth as prose — "Wi-Fi 7, 2×2, 160 MHz" — which the
engine ignores. Modulation is a pure function of signal strength, so there
is no loss feedback: collisions never make frames slower, and slower frames
never cause more collisions.

## Goals

1. Channel width of 20, 40, 80, 160 and 320 MHz, and one to four spatial
   streams, negotiated per link and affecting airtime and sensitivity.
2. MU-MIMO as a downlink multi-user split by space, beside the existing
   OFDMA split by frequency.
3. Rate adaptation with loss feedback, replacing the static signal-strength
   lookup at transmit time.
4. Four lessons, one idea each, at the existing five-to-eight minute pace.

## Non-goals

- Beamforming sounding exchanges (NDP announcement, NDP, feedback). MU-MIMO
  is modelled as its outcome, not its protocol. A later module may add the
  sounding overhead if a lesson needs it.
- Preamble puncturing and multi-RU. Both belong with the OBSS work in
  module 6, where a punctured channel has a reason to exist.
- 2.4 GHz and its 20/40 MHz-only rules. Module 6.

## Design

### Capability

`CapabilityProfile` in `src/model/types.ts` gains two fields:

```ts
widthMhz?: 20 | 40 | 80 | 160 | 320   // default 20
nss?: 1 | 2 | 3 | 4                   // default 1
```

Both optional with those defaults, which is what keeps lessons 1-14
unchanged: the course's `node()` helper in `src/course/lessons.ts` builds
capabilities as `{ generation, features }` and never sets either field.
Households build stations through `presetNode`, so `capsFor` in
`src/model/presets.ts` is where the real values enter.

A width is legal only if the generation allows it: non-HT is 20 MHz only,
VHT reaches 160, HE reaches 160, EHT reaches 320. A capability declaring
more is clamped to the generation's maximum inside `widthOf`, which is the
single place every consumer reads the value, so no caller can bypass it.

Negotiation, in `src/model/caps.ts` beside the existing `negotiated`:

```
negotiatedWidth(a, b) = min(widthOf(a), widthOf(b))
negotiatedNss(a, b)   = min(nssOf(a), nssOf(b))
```

Applied per transmitter-receiver pair. The access point's four streams
therefore serve a two-stream phone at two streams.

### Airtime

Data subcarriers per width, from the standard:

| Width | HE / EHT tones | ratio | VHT tones | ratio |
|---|---|---|---|---|
| 20 MHz | 234 | 1 | 52 | 1 |
| 40 MHz | 468 | 2.0 | 108 | 2.077 |
| 80 MHz | 980 | 4.188 | 234 | 4.5 |
| 160 MHz | 1960 | 8.376 | 468 | 9.0 |
| 320 MHz | 3920 | 16.752 | not applicable | |

`TxTimeOpts` in `src/engine/phy.ts` gains `widthMhz` and `nss`, and the
symbol count becomes

```
ndbps_effective = ndbps[mcs] × toneRatio(mode, widthMhz) × nss × ruFraction
```

The existing `ruFraction` term is unchanged and still expresses an OFDMA
resource unit as a fraction of the operating width. `maxPsduBytesFor` in
`src/engine/mac.ts` takes the same two parameters and applies the same
factor, so A-MPDU sizing under a TXOP budget stays consistent.

Validation the implementation must reproduce: EHT MCS 13 carries 2340 bits
per 13.6 µs symbol at 20 MHz and one stream, which is 172.06 Mb/s. At
320 MHz with two streams that is 172.06 × 16.752 × 2 = 5765 Mb/s. The
Xiaomi 17 Ultra preset's note claims "up to 5.8 Gbps". This becomes a test.

### Sensitivity

A wider channel admits proportionally more noise, so every rate needs more
signal by

```
delta dB = 10 × log10(widthMhz / 20)
```

which is 3.0, 6.0, 9.0 and 12.0 dB at 40, 80, 160 and 320 MHz. Applied in
`mcsForRssi` and `sinrThreshModeDb`, both of which gain a width parameter.
The consequence the lesson teaches: a station far from the access point
reaches a higher modulation on a narrow channel than on a wide one, and
there is a distance beyond which widening the channel loses throughput.

### Rate adaptation

A new `src/engine/rate.ts` holds one small controller per
transmitter-peer-link triple, owned by the MAC.

```
ceiling = mcsForRssi(mode, rssi, cap, widthMhz)   // recomputed per attempt
start   = ceiling
on failure: failures++, successes = 0
            if failures >= 2 then mcs = max(0, mcs - 1), failures = 0
on success: successes++, failures = 0
            if successes >= 10 then mcs = min(ceiling, mcs + 1), successes = 0
```

Signal strength sets the ceiling, losses push below it, and runs of success
climb back. The controller never exceeds the ceiling, so it cannot run away
from the propagation model, and it holds no randomness, so runs stay
deterministic. A failure is a missing ACK, or a BlockAck reporting every
subframe lost; a partial BlockAck counts as a success.

The call site is `src/engine/simulation.ts:114`, today a callback returning
`mcsForRssi`. It becomes a lookup into the controller, which the MAC
notifies from the paths that already know an attempt's outcome.

### MU-MIMO

A new feature flag `mumimo`, present for `he` and `eht` in `GEN_FEATURES`.

The access point forms a group of stations that all have pending downlink
data on the same link, all negotiate `mumimo`, and whose negotiated stream
counts sum to no more than the access point's. Each member is sent at its
own modulation over the full negotiated width with its own stream count.
This is the difference from OFDMA, where members share the width and each
gets a fraction of it. The PPDU lasts as long as its slowest member.

The implementation reuses the existing downlink multi-user machinery:
`muParts`, `orthogonalGroup`, and the BlockAck collection that resolves the
exchange on its last BlockAck. Frames gain `muKind` of either `ofdma` or
`mumimo` so the timeline and inspector can name what they are showing.

When both features are available the access point prefers MU-MIMO if every
candidate's pending head frame is at least 1000 B, and OFDMA otherwise.
That threshold is the trade real schedulers make: space multiplies rate,
which pays when there are data symbols to multiply, while frequency divides
the preamble, which pays when there are not.

### What moves and what does not

Lessons 1-14 keep 20 MHz and one stream by construction, so their
timelines, prose and quiz numbers are untouched. Households, the capstone
and the tampered-driver report take the presets' real values. Loaded pings
will fall substantially and every number in the Chinese report changes; the
rerun and its regenerated report are the last step of this module.

The `saturated` profile refills its queue on every dequeue, so it still
saturates a faster channel without changes. What changes is how much
traffic that is: two saturated stations on 160 MHz with two streams offer
roughly 1.5 Gb/s rather than 40 Mb/s.

## Lessons

Module 4, "How fast is fast", four lessons in `src/course/lessons.ts`,
matching the existing `Lesson` shape: bilingual body blocks, a scenario,
optional variants, jump targets, observations, things to try, and a quiz.

**15 · Channel width — twice the tones, half the time.** One station, one
1500 B frame, a variant per width. The frame visibly shrinks on the
timeline. Then the catch: the same station moved to the far bedroom is
faster at 40 MHz than at 160, because sensitivity rose 6 dB while the
signal did not.

**16 · Spatial streams — several conversations in the same air.** The same
frame at one, two and four streams. Establishes that streams multiply rate
without costing bandwidth or sensitivity, and that the link runs at the
minimum of the two ends, so a four-stream router and a two-stream phone
make a two-stream link.

**17 · MU-MIMO — splitting by space instead of frequency.** Three stations
with downlink data, run once as OFDMA and once as MU-MIMO. Same air, two
ways to share it. The lesson is when each wins: OFDMA pays the contention
once for many small frames, MU-MIMO multiplies the rate for a few large
ones, and both end together because the PPDU ends together.

**18 · Rate adaptation — the loop that picks the speed.** A station at the
edge of coverage with a competing uploader. Watch the modulation step down
after losses and climb back. The point of the lesson is the loop:
collisions cause losses, losses lower the rate, lower rates make frames
longer, longer frames collide more. Ties back to lesson 6's rate anomaly,
which is this loop's steady state.

## Testing

Unit, in `tests/engine/phy.test.ts`:
- tone ratios per mode and width against the table above
- EHT MCS 13 at 320 MHz and two streams is between 5.7 and 5.8 Gb/s
- sensitivity rises 3.01 dB per doubling of width
- a width above the generation's maximum is clamped to that maximum

Negotiation, in `tests/model/caps.test.ts`: a four-stream 320 MHz access
point and a two-stream 160 MHz phone negotiate two streams at 160 MHz.

Regression: lessons 1-14 produce identical airtime to the previous commit.
Implemented as a golden test over the first 200 ms of each lesson's frame
durations.

Rate adaptation, in `tests/engine/rate.test.ts`: a link forced to lose steps
down two modulations after four failures and returns to the ceiling after
twenty successes; the controller never exceeds the ceiling.

MU-MIMO, in `tests/engine/mumimo.test.ts`: a group forms only when the
summed streams fit; the PPDU's duration equals its slowest member's; every
member's BlockAck arrives and the exchange resolves on the last one.

Households, in `tests/model/households.test.ts`: at 160 MHz with two
streams a single 1500 B data frame takes between 2.5 and 4 times less
airtime than at 20 MHz with one stream, and a twenty-subframe aggregate
between 10 and 15 times less. The two bounds together are what pins the
fixed preamble against the scaled data symbols.

## Risks

**The re-baseline is large.** Every loaded ping in the report changes.
Mitigated by regenerating the report from the data in the same commit, as
the renderer already computes every sentence from the JSON.

**MU-MIMO grouping policy is a judgement call.** The preference rule above
is a heuristic, not something the standard dictates. It is stated in the
lesson as the simulator's choice, not as protocol.

**Sensitivity applied as a flat noise-bandwidth term** ignores that real
radios also lose a little to wider-channel implementation loss. The
simplification is stated in the lesson.
