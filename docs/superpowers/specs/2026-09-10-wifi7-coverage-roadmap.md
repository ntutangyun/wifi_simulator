# Roadmap: covering what a commercial Wi-Fi 7 AP actually does

Date: 2026-09-10

## Why

The engine models EDCA, A-MPDU with BlockAck, TXOP, RTS/CTS with capture,
downlink and trigger-based uplink OFDMA, two-link MLO, 4096-QAM, and
log-distance propagation with walls. Measured against a commercial Wi-Fi 7
access point, the notable absences are channel width beyond 20 MHz, spatial
streams, MU-MIMO, rate adaptation, station power save, TWT, EMLSR,
neighbouring BSSs with BSS colour and spatial reuse, and airtime fairness.
The cheat catalogue covers seven EDCA-parameter cheats and no others.

This roadmap closes both gaps as four modules of course material, each
shipped as a working increment: engine change, lessons, tests, committed
together.

## Order and grouping

| Module | Lessons | Engine work | Spec |
|---|---|---|---|
| 4 · How fast is fast | 15–18 | channel width, spatial streams, MU-MIMO, rate adaptation | `2026-09-10-phy-realism-design.md` |
| 5 · Sleep and schedules | 19–22 | power save and DTIM, TWT, restricted TWT, EMLSR | to be written |
| 6 · The neighbours | 23–27 | second BSS, BSS colour and spatial reuse, airtime fairness, band steering, 2.4 GHz | to be written |
| 7 · Breaking the rules | 28–31 | eight further cheats, their detection, report rerun | to be written |

Module 4 comes first because width and streams recalibrate every airtime
number the engine already produces. Everything built later sits on the
corrected baseline, and doing it in the other order would mean
re-baselining twice.

## Module 5 · Sleep and schedules

Station power save is the largest real-world latency contributor for a
phone at light load, and its absence is why the light-home scenario shows
nothing but WAN delay. Scope: DTIM beacons and buffered traffic, U-APSD,
individual TWT agreements, restricted TWT as Wi-Fi 7's own low-latency
answer for gaming, and EMLSR — one radio listening on two links, which is
what phones actually do, as against the simultaneous transmit-receive MLO
the engine models today.

## Module 6 · The neighbours

A single BSS is the engine's largest structural simplification. In an
apartment the neighbour's access point is the dominant interferer. Scope: a
second BSS on the same or an overlapping channel, BSS colour, spatial reuse
with an OBSS packet-detect threshold, airtime fairness as the one
commercial feature that partly defends against a greedy station, band
steering, and 2.4 GHz with its three non-overlapping channels.

## Module 7 · Breaking the rules

Eight cheats beyond the seven EDCA-parameter ones already modelled:
NAV-deaf, CCA-deaf, no post-transmission backoff, unlimited retries,
CTS-to-self with an inflated duration, excess transmit power, ignoring
MU-EDCA parameters after being triggered, opting out of trigger-based
uplink to keep full-band EDCA access, and transmitting on both links while
declaring EMLSR. The last three only become expressible once modules 4 and
5 exist. Ends with a rerun of the Chinese tampered-driver report over the
full catalogue.

## Delivery

Each module is a separate spec, plan and implementation cycle. A module is
done when its lessons are in the course, its tests pass, and the households
and reports that depend on it have been re-run.
