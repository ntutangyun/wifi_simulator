# Wi-Fi Sim v2 — Wi-Fi 5/6/7 Features + Editor/Timeline UX

**Date:** 2026-08-31 · extends `2026-08-31-wifi-sim-design.md` (v1, DCF core).
User-directed iteration: per-device Wi-Fi 5/6/7 features with toggles, timeline
hover labels/legend, editor pan/zoom/reset, 1 m grid, room deletion, object list.

## 1. Capability model

```ts
type FeatureFlag = 'edca' | 'ampdu' | 'txop' | 'ofdma' | 'mlo' | 'qam4k'
caps: { generation: 'nonht'|'vht'|'he'|'eht', features: Partial<Record<FeatureFlag, boolean>> }
NodeCfg.linkId?: '5g' | '6g'      // non-MLO placement; 6g only for he/eht
```
Generation-allowed features (defaults all ON for the generation):
- vht (Wi-Fi 5): edca, ampdu, txop
- he (Wi-Fi 6): + ofdma
- eht (Wi-Fi 7): + mlo, qam4k

Effective feature per STA↔AP pair = both sides have the flag and the generation.
Effective PHY mode per pair = min(generations). Control frames stay non-HT at
mandatory rates (§10.6).

## 2. PHY modes (20 MHz, Nss=1)

| mode | preamble | symbol | MCS table (Mbps) |
|---|---|---|---|
| nonht | 20 µs | 4 µs | 6…54 (clause 17, as v1) |
| vht | 40 µs | 4 µs | 6.5…78 (MCS0–8, N_DBPS 26…312) |
| he | 44 µs (+4 MU) | 13.6 µs | 8.6…143.4 (MCS0–11, N_DBPS 117…1950) |
| eht | 48 µs (+4 MU) | 13.6 µs | + MCS12/13 = 154.9/172.1 (4096-QAM, needs `qam4k`) |

Sensitivity ladders extend Table 17-21 pattern (−82 … −46 dBm); SINR threshold
= sens − noise floor as v1. NSYM = ⌈(16+8·L+6)/N_DBPS⌉ (PE ignored, documented).

## 3. EDCA (§10.23, defaults from Table 9-194, clause-17 column)

| AC | AIFSN | CWmin | CWmax | TXOP limit |
|---|---|---|---|---|
| BK(0) | 7 | 15 | 1023 | 2.528 ms |
| BE(1) | 3 | 15 | 1023 | 2.528 ms |
| VI(2) | 2 | 7 | 15 | 4.096 ms |
| VO(3) | 2 | 3 | 7 | 2.080 ms |

Per-node MAC = array of EDCAFs (legacy/edca-off = single EDCAF, AIFSN 2,
CW 15/1023, TXOP 0). AIFS = SIFS + AIFSN·slot. Internal collision: highest AC
transmits, losers double CW and redraw (no retry-counter increment, §10.23.2.2).
Traffic→AC: voice→VO, video→VI, browsing/saturated→BE, backup/iot→BK.
New `voice` profile: 200 B each way every 20 ms.

TXOP: winner may run SIFS-separated exchanges until the limit; each exchange
sets its own NAV (simplification: Duration covers one exchange, not TXOP rest).

## 4. A-MPDU + BlockAck (`ampdu`)

Aggregate head-of-AC MSDUs to the same peer: per MPDU = 4 B delimiter +
(26 QoS hdr + MSDU + 4 FCS) padded to 4 B; caps: ≤64 MPDUs, PPDU ≤ 4 ms
(≤ TXOP limit when nonzero). Response = BlockAck 32 B after SIFS. PPDU decode is
all-or-nothing (v1 channel), so BA acks all or the set retries (counters ×1).
RTS threshold compares aggregate PSDU.

## 5. OFDMA (`ofdma`, HE/EHT, AP-scheduled)

RU split = 1/n rate scaling, n ≤ 4 users. Channel gains orthogonal groups:
frames in one group don't interfere mutually, still occupy the medium (CCA) for
third parties; receivers may hold multiple same-group locks.
- **DL MU**: AP aggregates ≥2 users' frames into one MU PPDU (per-user MCS,
  padded to longest); addressed STAs decode their part; SIFS → simultaneous
  BAs (orthogonal group), AP multi-locks.
- **UL MU**: AP sends Basic Trigger (non-HT, 28+6n B) when ≥2 `ofdma` STAs have
  UL backlog (omniscient BSR stand-in, documented); SIFS → STAs transmit
  simultaneously (equal duration, padded); SIFS → Multi-STA BlockAck (32+8n B).
Failed parts stay queued and retry via EDCA.

## 6. MLO (`mlo`, EHT, STR)

Two links: `5g` (PL0 46.7 dB) and `6g` (PL0 47.9 dB). MLO AP+STA instantiate a
MAC per link ("virtual node" `id` on 5g, `id#6g` on 6g) sharing per-AC MLD
queues — a frame claimed by one link is unavailable to the other; failed sets
return to the queue and either link may retry (STR). Non-MLO nodes live on one
link (nonht/vht → 5g only). Queue records target the primary virtual id.
Lanes/inspector show per-link rows; 3D maps virtual→physical positions.

## 7. UX

- **Timeline strip**: color legend bar + hover tooltips per block (kind, frame
  details, AC, duration, times) via span hit-testing.
- **2D editor**: wheel zoom to cursor, middle/right-drag pan, ⌂ reset-view
  (fit house); grid minor 1 m / major 5 m + scale bar; default view fits content.
- **Object list**: side-panel tab (Objects) listing Nodes / Rooms / Walls —
  click-select (synced with canvas), delete, reorder (▲▼); node order = lane order.
- Node properties: generation (802.11a / Wi-Fi 5 / 6 / 7), per-feature
  checkboxes, link selector (non-MLO he/eht), plus v1 fields. Room delete stays
  available on canvas selection too.
