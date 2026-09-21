# Zero-to-hero Wi-Fi curriculum: design

Date: 2026-09-18
Status: target curriculum and build roadmap. Each build slice gets its own spec and plan.

## Purpose

The course is the main way its primary user goes from zero to a professional Wi-Fi engineer and researcher. The curriculum is the spec: when a lesson needs to show something, the engine gains that capability rather than the lesson falling back on text. Every engine addition keeps the rules set in standard alignment A:
- behaviour follows IEEE 802.11-2024 / 802.11be;
- the engine stays a superset of ns-3's wifi module;
- implementation-defined behaviour becomes selectable models.

## Audience and pace

- **Learner:** a single, motivated engineer starting from zero.
- **Density:** see `2026-09-21-course-readability-design.md` — depth after understanding; citations only in the sources block.
- **Length:** 15–25 minutes per lesson, including time in the simulator.
- **Stated duration:** estimated as words ÷ 150 wpm, plus 5 minutes per observe item and 5 per try-this item. Each estimate is checked by a test against the lesson's word count.
- **Structure:** four tiers: MAC foundations, MAC practitioner, PHY, researcher. Each tier ends with a project, not only quizzes.

## Lesson contract (applies to every lesson, old and new)

- Text is in EN and ZH (natural Simplified Chinese).
- Structure: concept → simulation (a preset scenario, optional variants) → observe → try this → quiz with explanations.
- **Every empirical claim in the prose is pinned by a test** (tests/course): timings, counts, percentages, orderings, "never"/"always". Standard constants are checked against `src/engine/phy.ts`. A lesson whose claim fails a test is not shipped.
- The simulator's simplifications are named in the lesson where they matter, and removed when a later slice adds the real mechanism.
- **Traffic:** simulated profiles by default. Lessons about real applications use traffic models characterized from phone captures (same setup, the app run on a phone, capture → profile). The capture method is itself a lesson (M8).
- Lessons not yet built are hidden from the course panel, not shown as placeholders.

## Target curriculum (MAC first, then PHY)

The learner specialises in MAC first. Until the PHY tier, the PHY is taught as a contract: SINR goes in; a decode outcome and an airtime come out. One primer lesson covers that contract. Modulation, OFDM, coding and fading come in Tier 3.

Legend:
- ✅ existing lesson (kept; renumbered, retimed or reworded)
- ✂ split from an existing lesson
- ➕ new lesson on the current engine
- 🔧 new lesson that needs engine/UI work, named in brackets

### Tier 1 — MAC foundations (zero → junior MAC engineer)

**M1 The network and the frame**
1. 🔧 Radio primer for MAC engineers: dBm, path loss and walls, noise floor, SINR, detection and sensitivity, the MCS ladder as a table of SINR requirements [link-budget and MCS-ladder widgets; noise and SINR model per the Tier 1 slice spec]
2. ➕ Roles and the stack: STA, AP, BSS, ESS, DS, SSID/BSSID; the PHY/MAC split and the service boundary
3. 🔧 Frame anatomy: frame control, Duration, addresses 1–4, sequence control, QoS control, FCS; data, control and management frames; PPDU = preamble + PHY header + PSDU [field-level frame decoder]
4. ✅ Frames cost airtime

**M2 Channel access (DCF)**
5. ✅ IFS and the ACK dance
6. ✅ Random backoff and collisions
7. ✅ NAV
8. ✅ Hidden nodes and RTS/CTS
9. ✅ Rate anomaly and capture
10. 🔧 Retries, drops and queues: the 802.11-2020 retry model, queue limits, MSDU lifetime, head-of-line delay [queue cap, lifetime]
11. ➕ Saturation throughput from first principles: the Bianchi model against the simulator
12. ➕ Tier 1 project: predict airtime share, collision probability and throughput for a flat analytically, then verify in the simulator and explain every gap

### Tier 2 — MAC practitioner (junior → professional MAC engineer)

**M3 QoS and efficiency**
- ✂ The IFS ladder
- ✂ EDCA
- ➕ Cheating on EDCA
- 🔧 A-MPDU and Block Ack: bitmaps, partial retransmission, reordering
- 🔧 A-MSDU
- ✅ TXOP
- ✅ Burst protection

**M4 Capacity knobs and rate control**
- ✅ Channel width, taught as a capacity knob
- ✅ Spatial streams, taught as a capacity knob
- ✂ Rate adaptation I: the control loop
- 🔧 Rate adaptation II: Ideal, Minstrel-HT, Thompson sampling
- ✂ The airtime tax, and why the death spiral does not happen

**M5 Link lifecycle, security and power (MAC management)**
- 🔧 Beacons, TIM/DTIM, scanning
- 🔧 Authentication and association
- 🔧 Security: WPA2, WPA3 SAE, the 4-way handshake, PMF
- 🔧 Roaming with 802.11k/v/r
- 🔧 Power save: PS-Poll, U-APSD
- 🔧 TWT

**M6 Neighbours and spatial reuse**
- 🔧 Overlapping BSSs and exposed nodes
- 🔧 Channel planning, primary/secondary 20 MHz, per-20 MHz CCA
- 🔧 BSS colour, OBSS-PD, intra-BSS and basic NAV

**M7 Scheduled Wi-Fi 6/7**
- ✅ OFDMA downlink, 🔧 with real resource units and puncturing
- ✅ Triggered uplink, 🔧 with BSRP/BSR, MU EDCA and uplink power control
- ✅ MU-MIMO, 🔧 with sounding cost and VHT MU-MIMO
- ✅ MLO, 🔧 with EMLSR/NSTR
- 🔧 TID-to-link mapping and multi-link setup

**M8 Real applications**
- 🔧 Characterising an application: capture → traffic model
- ✅/🔧 Gaming latency end to end
- 🔧 Video and voice quality
- ✅ Capstone: the busy household
- Tier 2 project: diagnose a household that performs badly

### Tier 3 — PHY (the layer underneath)

- 🔧 Signals, bands and channels
- 🔧 Modulation and constellations
- 🔧 OFDM, symbols and guard intervals
- 🔧 Coding, MCS and SNR→PER, from our own generated link-level tables. The engine switches to a seeded PER draw here, and every lesson is re-baselined.
- 🔧 Multipath, fading, MIMO
- 🔧 2.4 GHz PHYs (DSSS/ERP), protection and coexistence
- ➕ Why width and streams work (revisiting M4)

### Tier 4 — Researcher

- 🔧 Wi-Fi 8 (802.11bn), scoped from the local TGbn Mentor corpus
- ➕ Experiment design and statistics
- 🔧 Validating a simulator against analytic models, ns-3 and measurements
- ➕ Reading the standard and the task-group process
- ➕ From problem to contribution or patent
- Tier 4 project: an 802.11bn-style enhancement implemented, evaluated and written up

## Build roadmap

| Slice | Delivers | Engine/UI work |
|---|---|---|
| S1 | Tier 1 and the renumbering of all existing lessons | MAC-relevant PHY fidelity (noise per width, receiver noise figure, required SINR from the standard's sensitivity, 4 dB preamble detection, CCA after own TX), queue cap and MSDU lifetime, field-level frame decoder, widget blocks, tiered course panel with computed durations |
| S2 | M3 + M4 | Block Ack with bitmaps and partial retransmission, A-MSDU, rate-control family |
| S3 | M6 | multiple BSSs, channels and per-20 MHz CCA, BSS colour, OBSS-PD, two NAVs |
| S4 | M7 | real resource units, puncturing, BSR/MU EDCA, sounding, VHT MU-MIMO, EMLSR/NSTR, T2LM |
| S5 | M5 | beacons, scanning, association, security handshakes, roaming, power save, TWT |
| S6 | M8 | capture-derived traffic profiles, quality metrics |
| S7 | Tier 3 | link-level PER generator and seeded PER draw, PHY views, fading, 2.4 GHz PHYs |
| S8 | Tier 4 | 802.11bn features, ns-3 comparison harness |

## Out of scope

- Real-hardware labs other than application traffic capture for M8.
- Non-802.11 technologies, except where coexistence is taught (Tier 3).
