### Task 3: Wi-Fi side of the coupling

**Files:** modify `src/engine/channel.ts`, `src/engine/simulation.ts`; test `tests/engine/channel-spectrum.test.ts`.

Changes to `Channel`:
- New optional constructor argument `spectrum?: { s: Spectrum; posOf: (id: string) => Vec3; centerMhz: number }` (only passed for the 6 GHz link). On `startTx` of a frame it calls `s.emit('wifi', { txId, eirpDbm: txPowerDbm of the node (from the scenario; pass `txPowerOf(id)` in the same argument), bandLo/Hi: centre ± width/2 })`, on `endTx` it retires.
- `interferenceMw(rid, lock)` adds `s.foreignMw('wifi', posOf(rid), lo, hi)` for the lock's PPDU band; `othersMw` (preamble detection) likewise; `updateAllCca` adds foreign mW to the energy sum.
- `s.onChange('wifi', t => { for every radio, for every open lock: lock.maxInterfMw = max(…, interferenceMw) ; updateAllCca(t) })`.
- `Simulation`: for the `'6g'` link, when `sc.uwb?.channel === 5`, UWB nodes exist and `uwbBandOverlap(center, widthMax, 5) > 0` (widthMax = the widest negotiated width on the link — compute from `negotiatedWidth` over members, or simply 160), construct the `Spectrum` once and pass it to that link's `Channel` and (Task 4) to the `UwbNetwork`.

- [ ] Tests: build a Wi-Fi channel with a spectrum stub (or a real Spectrum with a hand-registered UWB emission): a lock's `maxInterfMw` includes the foreign term; RX_OK flips to RX_FAIL lowSinr when the foreign power is raised enough; CCA_BUSY 'energy' appears when a foreign emission above −62 dBm exists; without a spectrum nothing changes (the existing `tests/engine/channel.test.ts` suite still green; `lesson-hashes` unchanged).
- [ ] Implement, run, commit `feat(engine): Wi-Fi channel hears foreign in-band power through the Spectrum`.

---

