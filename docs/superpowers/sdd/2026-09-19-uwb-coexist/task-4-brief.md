### Task 4: UWB side, record, view, log, inspector, Simulation wiring

**Files:** modify `src/uwb/channel.ts`, `src/uwb/network.ts` (pass-through), `src/engine/simulation.ts`, `src/uwb/records.ts`, `src/uwb/view.ts`, `src/uwb/format.ts`, `src/uwb/ui/rows.ts`, `src/uwb/ui/UwbInspector.tsx`, `src/ui/i18n.ts`; tests `tests/uwb/channel-coexist.test.ts`, `tests/uwb/network.test.ts` (+2), `tests/uwb/view.test.ts` (+1), `tests/ui/uwb-format.test.ts` (+1).

- `UwbChannel` gains optional `spectrum?: Spectrum`: on `transmit` it emits `{ txId, eirpDbm: txPowerDbm, band: UWB_BAND_MHZ[ch] }` and retires at TX end; each open reception tracks `maxForeignMw` (initialised at arrival, raised on every `onChange('uwb')` notification); at the reception's end, after the collision check, `sirDb = rssiDbm − dbm(maxForeignMw)`; if `sirDb < UWB_SIR_MIN_DB` → `RX_FAIL { reason: 'lowSinr' }` + `UWB_INTERFERED { node, from, foreignDbm, sirDb }` + `onRxFail`. `UwbRxInfo.foreignDbm` (−Infinity when none).
- `UwbRecord` gains `{ type: 'UWB_INTERFERED'; node; from; foreignDbm; sirDb }`; `UwbNodeView.interfered: number`; `fmtUwbRecord`: `${node} UWB frame from ${from} lost to Wi-Fi: SIR ${sirDb.toFixed(1)} dB (foreign ${foreignDbm.toFixed(1)} dBm)`; inspector row "lost to Wi-Fi" EN/ZH.
- `Simulation` passes the spectrum into `UwbNetwork` → `UwbChannel`.

- [ ] Tests: a UWB reception with a hand-registered Wi-Fi emission at −42 dBm vs rssi −76.7 → RX_FAIL lowSinr + UWB_INTERFERED with sirDb ≈ −34.7; with the Wi-Fi emission 20 dB weaker than the UWB signal → RX_OK; a Wi-Fi emission that starts mid-reception still counts (max over the reception); with overlap 0 (channel 9) no spectrum is built and records equal the no-Wi-Fi run for the UWB subsequence; a mixed lesson-5-style scenario with `sixGhzCenterMhz: 6305` and a saturated 6 GHz laptop loses UWB frames (count > 0) while the same with 5985 loses none.
- [ ] Implement, run (`lesson-hashes` unchanged), commit `feat(uwb): UWB receptions fail under in-band Wi-Fi; UWB_INTERFERED record and inspector row`.

---

